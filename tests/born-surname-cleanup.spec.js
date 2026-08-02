const { test, expect } = require('@playwright/test');
const {
  analyzeTree,
  cleanBornSurnameArtifact
} = require('../scripts/clean-born-surname-artifacts.cjs');

test('PDF-Satzfragment born wird entfernt und der echte Nachname rekonstruiert', () => {
  const person = {
    id: 'regular',
    name: 'Alex Mustermann. He was born',
    firstName: 'Alex Mustermann. He was',
    lastName: 'born',
    location: '',
    note: ''
  };

  expect(cleanBornSurnameArtifact(person)).not.toBeNull();
  expect(person).toMatchObject({
    name: 'Alex Mustermann',
    firstName: 'Alex',
    lastName: 'Mustermann'
  });
  expect(analyzeTree({ people: [person] })).toMatchObject({
    artifacts: [],
    invalidBornSurnames: []
  });
});

test('echter Familienname Born bleibt erhalten', () => {
  const person = {
    id: 'real-born',
    name: 'Mira Born. She was born',
    firstName: 'Mira Born. She was',
    lastName: 'born',
    location: '',
    note: ''
  };

  cleanBornSurnameArtifact(person);
  expect(person).toMatchObject({ name: 'Mira Born', firstName: 'Mira', lastName: 'Born' });
  expect(analyzeTree({ people: [person] }).genuineBornSurnames).toHaveLength(1);
});

test('Orts- und unsichere Datumsfragmente gehen bei der Bereinigung nicht verloren', () => {
  const located = {
    id: 'located',
    name: 'Celia R. Muster in Beispielstadt, Musterland, Teststaat. She was born',
    firstName: '',
    lastName: 'born',
    location: '',
    note: ''
  };
  const dated = {
    id: 'dated',
    name: 'Dora Beispiel November 18, 1967. She was born',
    firstName: '',
    lastName: 'born',
    location: '',
    note: ''
  };

  cleanBornSurnameArtifact(located);
  cleanBornSurnameArtifact(dated);
  expect(located).toMatchObject({
    name: 'Celia R. Muster',
    firstName: 'Celia R.',
    lastName: 'Muster',
    location: 'Beispielstadt, Musterland, Teststaat'
  });
  expect(dated).toMatchObject({
    name: 'Dora Beispiel',
    firstName: 'Dora',
    lastName: 'Beispiel'
  });
  expect(dated.note).toContain('November 18, 1967');
});

test('eingeschobene PDF-Seitenköpfe werden aus dem Namen entfernt', () => {
  const person = {
    id: 'ocr-header',
    name: 'Ada M. Descendants of : Page 187 of 2 Joseph Bodensteiner Muster. She was born',
    firstName: '',
    lastName: 'born',
    location: '',
    note: ''
  };

  cleanBornSurnameArtifact(person);
  expect(person).toMatchObject({ name: 'Ada M. Muster', firstName: 'Ada M.', lastName: 'Muster' });
});
