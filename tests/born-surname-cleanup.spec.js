const { test, expect } = require('@playwright/test');
const {
  analyzeTree,
  cleanBornSurnameArtifact
} = require('../scripts/clean-born-surname-artifacts.cjs');

test('PDF-Satzfragment born wird entfernt und der echte Nachname rekonstruiert', () => {
  const person = {
    id: 'regular',
    name: 'Aaron Souhrada. He was born',
    firstName: 'Aaron Souhrada. He was',
    lastName: 'born',
    location: '',
    note: ''
  };

  expect(cleanBornSurnameArtifact(person)).not.toBeNull();
  expect(person).toMatchObject({
    name: 'Aaron Souhrada',
    firstName: 'Aaron',
    lastName: 'Souhrada'
  });
  expect(analyzeTree({ people: [person] })).toMatchObject({
    artifacts: [],
    invalidBornSurnames: []
  });
});

test('echter Familienname Born bleibt erhalten', () => {
  const person = {
    id: 'real-born',
    name: 'Michael Born. He was born',
    firstName: 'Michael Born. He was',
    lastName: 'born',
    location: '',
    note: ''
  };

  cleanBornSurnameArtifact(person);
  expect(person).toMatchObject({ name: 'Michael Born', firstName: 'Michael', lastName: 'Born' });
  expect(analyzeTree({ people: [person] }).genuineBornSurnames).toHaveLength(1);
});

test('Orts- und unsichere Datumsfragmente gehen bei der Bereinigung nicht verloren', () => {
  const located = {
    id: 'located',
    name: 'Celeste R. Weaver in Bar Harbor, Hancock County, Maine. She was born',
    firstName: '',
    lastName: 'born',
    location: '',
    note: ''
  };
  const dated = {
    id: 'dated',
    name: 'Dorothy Barbara Busta November 18, 1967. She was born',
    firstName: '',
    lastName: 'born',
    location: '',
    note: ''
  };

  cleanBornSurnameArtifact(located);
  cleanBornSurnameArtifact(dated);
  expect(located).toMatchObject({
    name: 'Celeste R. Weaver',
    firstName: 'Celeste R.',
    lastName: 'Weaver',
    location: 'Bar Harbor, Hancock County, Maine'
  });
  expect(dated).toMatchObject({
    name: 'Dorothy Barbara Busta',
    firstName: 'Dorothy Barbara',
    lastName: 'Busta'
  });
  expect(dated.note).toContain('November 18, 1967');
});

test('eingeschobene PDF-Seitenköpfe werden aus dem Namen entfernt', () => {
  const person = {
    id: 'ocr-header',
    name: 'Annette M. Descendants of : Page 187 of 2 Joseph Bodensteiner Nolte. She was born',
    firstName: '',
    lastName: 'born',
    location: '',
    note: ''
  };

  cleanBornSurnameArtifact(person);
  expect(person).toMatchObject({ name: 'Annette M. Nolte', firstName: 'Annette M.', lastName: 'Nolte' });
});
