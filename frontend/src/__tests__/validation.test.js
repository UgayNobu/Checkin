import { describe, test, expect } from 'vitest';
import { validateLogin, validateRegister, passwordOk } from '../validation.js';

// A sign-up form that passes every rule; each test breaks one field.
const goodStudent = {
  name: 'Sonam Dorji',
  userId: '02250368',
  email: '02250368.cst@rub.edu.bt',
  pick: 'BE in Software Engineering',
  password: 'Cst@2026',
  again: 'Cst@2026',
};

describe('validateLogin', () => {
  test('TC-UNIT-33: empty ID and password both give errors', () => {
    expect(validateLogin({ userId: '', password: '' })).toEqual({
      userId: 'Enter your ID.',
      password: 'Enter your password.',
    });
  });

  test('TC-UNIT-34: edge case - an ID of only spaces counts as empty; old IDs like U004 are allowed', () => {
    expect(validateLogin({ userId: '   ', password: 'x' })).toEqual({ userId: 'Enter your ID.' });
    expect(validateLogin({ userId: 'U004', password: 'anything' })).toEqual({});
  });
});

describe('validateRegister', () => {
  test('TC-UNIT-35: a correct student sign-up gives no errors', () => {
    expect(validateRegister(goodStudent, false)).toEqual({});
  });

  test('TC-UNIT-36: an empty form gives an error for every field', () => {
    const empty = { name: '', userId: '', email: '', pick: '', password: '', again: '' };
    expect(Object.keys(validateRegister(empty, false)).sort())
      .toEqual(['again', 'email', 'name', 'password', 'pick', 'userId']);
  });

  test('TC-UNIT-37: bad input - non-college email, 7-digit ID and mismatched passwords are refused', () => {
    const e = validateRegister({ ...goodStudent, email: 'sonam@gmail.com', userId: '0225036', again: 'Cst@2027' }, false);
    expect(e.email).toBe('Use your college email ending in @rub.edu.bt.');
    expect(e.userId).toBe('Student number is 8 digits, e.g. 02250368.');
    expect(e.again).toBe('Passwords do not match.');
  });

  test('TC-UNIT-38: edge case - a tutor needs a staff ID like CST-0142, not a student number', () => {
    expect(validateRegister({ ...goodStudent, userId: 'CST-0142' }, true)).toEqual({});
    expect(validateRegister(goodStudent, true).userId).toBe('Staff ID looks like CST-0142.');
  });
});

describe('passwordOk', () => {
  test('TC-UNIT-39: a password with upper, lower, number and symbol passes', () => {
    expect(passwordOk('Cst@2026')).toBe(true);
  });

  test('TC-UNIT-40: a password missing a symbol fails; so do short, spaced and empty ones', () => {
    expect(passwordOk('Cst12026')).toBe(false); // no symbol
    expect(passwordOk('Cs@1')).toBe(false); // too short
    expect(passwordOk('Cst @2026')).toBe(false); // has a space
    expect(passwordOk('')).toBe(false);
    expect(passwordOk(undefined)).toBe(false);
  });

  test('TC-UNIT-41: edge case - exactly 8 and 64 characters pass, 65 fails', () => {
    expect(passwordOk('Ab1@abcd')).toBe(true);
    expect(passwordOk('Ab1@' + 'a'.repeat(60))).toBe(true);
    expect(passwordOk('Ab1@' + 'a'.repeat(61))).toBe(false);
  });
});
