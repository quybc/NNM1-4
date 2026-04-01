var express = require("express");
var router = express.Router();
let { validatedResult, CreateAnUserValidator, ModifyAnUserValidator } = require('../utils/validator')
let userModel = require("../schemas/users");
let userController = require('../controllers/users')
let { CheckLogin, CheckRole } = require('../utils/authHandler')
let { uploadExcel } = require('../utils/uploadHandler')
let exceljs = require('exceljs')
let path = require('path')
let roleModel = require('../schemas/roles')
let cartModel = require('../schemas/carts')
let mongoose = require('mongoose')
let { sendWelcomePasswordMail } = require('../utils/mailHandler')
let { generateRandomPassword } = require('../utils/passwordHandler')

function getCellText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    if (Array.isArray(value.richText)) {
      return value.richText.map(function (item) {
        return item.text;
      }).join("").trim();
    }

    if (value.text) {
      return String(value.text).trim();
    }

    if (value.hyperlink) {
      return String(value.hyperlink).trim();
    }

    if (value.result !== undefined && value.result !== null) {
      return String(value.result).trim();
    }
  }

  return String(value).trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUsername(username) {
  return /^[a-zA-Z0-9]+$/.test(username);
}

async function getOrCreateUserRole() {
  let userRole = await roleModel.findOne({
    isDeleted: false,
    name: { $regex: /^user$/i }
  });

  if (userRole) {
    return userRole;
  }

  userRole = new roleModel({
    name: "USER",
    description: "Default role for imported users"
  });
  await userRole.save();
  return userRole;
}

router.get("/", CheckLogin,CheckRole("ADMIN", "USER"), async function (req, res, next) {
    let users = await userModel
      .find({ isDeleted: false })
    res.send(users);
  });

router.get("/:id", async function (req, res, next) {
  try {
    let result = await userModel
      .find({ _id: req.params.id, isDeleted: false })
    if (result.length > 0) {
      res.send(result);
    }
    else {
      res.status(404).send({ message: "id not found" });
    }
  } catch (error) {
    res.status(404).send({ message: "id not found" });
  }
});

router.post("/", CreateAnUserValidator, validatedResult, async function (req, res, next) {
  try {
    let newItem = await userController.CreateAnUser(
      req.body.username, req.body.password, req.body.email, req.body.role,
      null, req.body.fullName, req.body.avatarUrl, req.body.status, req.body.loginCount)
    res.send(newItem);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

router.post("/import", uploadExcel.single('file'), async function (req, res, next) {
  if (!req.file) {
    return res.status(404).send({
      message: "file khong duoc de trong"
    });
  }

  try {
    let workbook = new exceljs.Workbook();
    let pathFile = path.join(__dirname, '../uploads', req.file.filename)
    await workbook.xlsx.readFile(pathFile)

    let worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return res.status(400).send({
        message: "file excel khong co du lieu"
      });
    }

    let headerRow = worksheet.getRow(1);
    let headerMap = {};
    for (let columnIndex = 1; columnIndex <= headerRow.cellCount; columnIndex++) {
      let headerName = getCellText(headerRow.getCell(columnIndex).value).toLowerCase();
      if (headerName) {
        headerMap[headerName] = columnIndex;
      }
    }

    let usernameColumn = headerMap.username || 1;
    let emailColumn = headerMap.email || 2;

    let userRole = await getOrCreateUserRole();

    let existingUsers = await userModel.find({ isDeleted: false }).select('username email');
    let usernames = new Set(existingUsers.map(function (user) {
      return user.username.toLowerCase();
    }));
    let emails = new Set(existingUsers.map(function (user) {
      return user.email.toLowerCase();
    }));

    let importedUsernames = new Set();
    let importedEmails = new Set();
    let results = [];

    for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex++) {
      let row = worksheet.getRow(rowIndex);
      let username = getCellText(row.getCell(usernameColumn).value);
      let email = getCellText(row.getCell(emailColumn).value).toLowerCase();

      if (!username && !email) {
        continue;
      }

      let errors = [];
      let normalizedUsername = username.toLowerCase();

      if (!username) {
        errors.push("username khong duoc de trong");
      } else if (!isValidUsername(username)) {
        errors.push("username khong duoc chua ki tu dac biet");
      }

      if (!email) {
        errors.push("email khong duoc de trong");
      } else if (!isValidEmail(email)) {
        errors.push("email sai dinh dang");
      }

      if (username && (usernames.has(normalizedUsername) || importedUsernames.has(normalizedUsername))) {
        errors.push("username da ton tai");
      }

      if (email && (emails.has(email) || importedEmails.has(email))) {
        errors.push("email da ton tai");
      }

      if (errors.length > 0) {
        results.push({
          row: rowIndex,
          username: username,
          email: email,
          status: "failed",
          errors: errors
        });
        continue;
      }

      let password = generateRandomPassword(16);
      let session = await mongoose.startSession();

      try {
        session.startTransaction();

        let newUser = await userController.CreateAnUser(
          username,
          password,
          email,
          userRole._id,
          session
        );

        let newCart = new cartModel({
          user: newUser._id
        })

        await newCart.save({ session })
        await sendWelcomePasswordMail(email, username, password)
        await session.commitTransaction();
        await session.endSession()

        usernames.add(normalizedUsername);
        emails.add(email);
        importedUsernames.add(normalizedUsername);
        importedEmails.add(email);

        results.push({
          row: rowIndex,
          username: username,
          email: email,
          role: userRole.name,
          status: "success"
        });
      } catch (error) {
        await session.abortTransaction();
        await session.endSession()
        results.push({
          row: rowIndex,
          username: username,
          email: email,
          status: "failed",
          errors: [error.message]
        });
      }
    }

    res.send({
      filename: req.file.filename,
      role: userRole.name,
      totalRows: Math.max(worksheet.rowCount - 1, 0),
      successCount: results.filter(function (item) {
        return item.status === "success";
      }).length,
      failedCount: results.filter(function (item) {
        return item.status === "failed";
      }).length,
      results: results
    })
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

router.put("/:id", ModifyAnUserValidator, validatedResult, async function (req, res, next) {
  try {
    let id = req.params.id;
    let updatedItem = await userModel.findByIdAndUpdate(id, req.body, { new: true });

    if (!updatedItem) return res.status(404).send({ message: "id not found" });

    let populated = await userModel
      .findById(updatedItem._id)
    res.send(populated);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

router.delete("/:id", async function (req, res, next) {
  try {
    let id = req.params.id;
    let updatedItem = await userModel.findByIdAndUpdate(
      id,
      { isDeleted: true },
      { new: true }
    );
    if (!updatedItem) {
      return res.status(404).send({ message: "id not found" });
    }
    res.send(updatedItem);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

module.exports = router;
