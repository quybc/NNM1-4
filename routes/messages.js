let express = require('express');
let mongoose = require('mongoose');
let router = express.Router();
let messageModel = require('../schemas/messages');
let userModel = require('../schemas/users');
let { CheckLogin } = require('../utils/authHandler');
let { uploadFile } = require('../utils/uploadHandler');

let userSelectFields = '_id username email fullName avatarUrl status';

function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

async function getActiveUserById(id) {
    return await userModel.findOne({
        _id: id,
        isDeleted: false
    }).select(userSelectFields);
}

function getStoredFilePath(file) {
    return '/uploads/' + file.filename;
}

router.get('/', CheckLogin, async function (req, res, next) {
    try {
        let currentUserId = new mongoose.Types.ObjectId(req.user._id.toString());
        let latestMessages = await messageModel.aggregate([
            {
                $match: {
                    $or: [
                        { from: currentUserId },
                        { to: currentUserId }
                    ]
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            },
            {
                $addFields: {
                    conversationUser: {
                        $cond: [
                            { $eq: ['$from', currentUserId] },
                            '$to',
                            '$from'
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: '$conversationUser',
                    latestMessage: {
                        $first: '$$ROOT'
                    }
                }
            },
            {
                $replaceRoot: {
                    newRoot: '$latestMessage'
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            }
        ]);

        let populatedMessages = await messageModel.populate(latestMessages, [
            {
                path: 'from',
                select: userSelectFields
            },
            {
                path: 'to',
                select: userSelectFields
            },
            {
                path: 'conversationUser',
                select: userSelectFields,
                model: 'user'
            }
        ]);

        let result = populatedMessages.filter(function (message) {
            return message.conversationUser;
        });

        res.send(result);
    } catch (error) {
        res.status(400).send({
            message: error.message
        });
    }
});

router.get('/:userId', CheckLogin, async function (req, res, next) {
    try {
        let currentUserId = req.user._id;
        let userId = req.params.userId;

        if (!isValidObjectId(userId)) {
            return res.status(400).send({
                message: 'userID khong hop le'
            });
        }

        let user = await getActiveUserById(userId);
        if (!user) {
            return res.status(404).send({
                message: 'userID khong ton tai'
            });
        }

        let messages = await messageModel.find({
            $or: [
                {
                    from: currentUserId,
                    to: userId
                },
                {
                    from: userId,
                    to: currentUserId
                }
            ]
        }).sort({
            createdAt: 1
        }).populate([
            {
                path: 'from',
                select: userSelectFields
            },
            {
                path: 'to',
                select: userSelectFields
            }
        ]);

        res.send(messages);
    } catch (error) {
        res.status(400).send({
            message: error.message
        });
    }
});

router.post('/', CheckLogin, uploadFile.single('file'), async function (req, res, next) {
    try {
        let to = req.body.to;
        let text = req.body.text;

        if (!to) {
            return res.status(400).send({
                message: 'to khong duoc de trong'
            });
        }

        if (!isValidObjectId(to)) {
            return res.status(400).send({
                message: 'userID khong hop le'
            });
        }

        let receiver = await getActiveUserById(to);
        if (!receiver) {
            return res.status(404).send({
                message: 'userID khong ton tai'
            });
        }

        let messageType = req.file ? 'file' : 'text';
        let content = req.file ? getStoredFilePath(req.file) : text;

        if (!content || !String(content).trim()) {
            return res.status(400).send({
                message: 'Noi dung tin nhan khong duoc de trong'
            });
        }

        let newMessage = new messageModel({
            from: req.user._id,
            to: to,
            messageContent: {
                type: messageType,
                text: String(content).trim()
            }
        });

        await newMessage.save();
        await newMessage.populate([
            {
                path: 'from',
                select: userSelectFields
            },
            {
                path: 'to',
                select: userSelectFields
            }
        ]);

        res.send(newMessage);
    } catch (error) {
        res.status(400).send({
            message: error.message
        });
    }
});

module.exports = router;
