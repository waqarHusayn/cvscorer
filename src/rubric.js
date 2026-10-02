export const BULLET_QUESTIONS = {
  impact: {
    type: 'noul',
    instructions: 'The bullet states an outcome or improvement.',
    criteria: { true: 'It states an outcome or improvement', false: 'It only describes an activity' },
  },
  clarity: {
    type: 'noul',
    instructions: 'The bullet is specific and easy to understand.',
    criteria: { true: 'It is specific and clear', false: 'It is vague or unclear' },
  },
};

export const matchQuestion = (skill) => ({
  type: 'noul',
  instructions: `The CV shows hands on experience with ${skill}.`,
  criteria: { true: 'The CV demonstrates hands-on experience', false: 'The CV does not demonstrate hands-on experience' },
});
