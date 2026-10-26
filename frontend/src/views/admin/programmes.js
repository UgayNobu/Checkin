// Must match the list in Register.jsx exactly, because students are stored with this name
export const PROGRAMMES = [
  'B.E. Software Engineering',
  'B.E. Information Technology',
  'B.E. Electronics and Communication',
  'B.E. Civil Engineering',
  'B.E. Electrical Engineering',
  'Bachelor of Architecture',
  'B.E. Engineering Geology',
  'B.E. Instrumentation and Control Engineering',
  'B.E. Water Resource Engineering',
  'Master in Construction Management',
  'Master of Science in Engineering (by Research)',
];
// Which sign-up department (Register.jsx DEPT list) teaches each programme.
// Used to list a programme's tutors even before they are assigned a module.
export const PROGRAMME_DEPARTMENT = {
  'B.E. Software Engineering': 'Computing Technologies',
  'B.E. Information Technology': 'Computing Technologies',
  'B.E. Electronics and Communication': 'Electrical & Electronics Engineering',
  'B.E. Electrical Engineering': 'Electrical & Electronics Engineering',
  'B.E. Instrumentation and Control Engineering': 'Electrical & Electronics Engineering',
  'B.E. Civil Engineering': 'Civil & Environmental Engineering',
  'B.E. Engineering Geology': 'Civil & Environmental Engineering',
  'B.E. Water Resource Engineering': 'Civil & Environmental Engineering',
  'Master in Construction Management': 'Civil & Environmental Engineering',
  'B.E. Mechanical Engineering': 'Mechanical Engineering',
  'Bachelor of Architecture': 'Architecture',
};

// "Computing Technologies Department" ≈ "Dept. of Computing Technologies" ≈ "computing technologies"
export const sameDept = (a, b) => {
  const n = (t) => String(t || '').toLowerCase().replace(/&/g, 'and').replace(/\b(the|department|dept\.?|of)\b/g, '').replace(/[^a-z]/g, '');
  return !!n(a) && n(a) === n(b);
};
