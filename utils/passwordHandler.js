const crypto = require('crypto');

const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*_-+=';

function pickRandomCharacter(characters) {
    return characters[crypto.randomInt(0, characters.length)];
}

function shuffle(characters) {
    for (let index = characters.length - 1; index > 0; index--) {
        const randomIndex = crypto.randomInt(0, index + 1);
        const temp = characters[index];
        characters[index] = characters[randomIndex];
        characters[randomIndex] = temp;
    }

    return characters;
}

module.exports = {
    generateRandomPassword: function (length = 16) {
        if (length < 4) {
            throw new Error('Password length must be at least 4 characters');
        }

        const passwordCharacters = [
            pickRandomCharacter(UPPERCASE),
            pickRandomCharacter(LOWERCASE),
            pickRandomCharacter(DIGITS),
            pickRandomCharacter(SYMBOLS)
        ];

        const allCharacters = UPPERCASE + LOWERCASE + DIGITS + SYMBOLS;

        while (passwordCharacters.length < length) {
            passwordCharacters.push(pickRandomCharacter(allCharacters));
        }

        return shuffle(passwordCharacters).join('');
    }
}
