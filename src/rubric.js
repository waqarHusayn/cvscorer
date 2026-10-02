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

export const SEMANTIC_QUESTIONS = {
  result: {
    type: 'noul',
    instructions: 'The text states a concrete result or measurable change caused by the work.',
    criteria: { true: 'A concrete result or change is stated', false: 'Only an activity or responsibility is stated' },
  },
  relevance: {
    type: 'noul',
    instructions: 'The text is relevant evidence for the target role or requirement.',
    criteria: { true: 'It is relevant evidence', false: 'It is not relevant evidence' },
  },
  skillEvidence: {
    type: 'noul',
    instructions: 'The text demonstrates hands-on use of the named skill rather than merely listing it.',
    criteria: { true: 'Hands-on use is demonstrated', false: 'The skill is only claimed or absent' },
  },
  credibility: {
    type: 'noul',
    instructions: 'The text makes a believable, adequately supported claim without an implausible metric.',
    criteria: { true: 'The claim is believable and supported', false: 'The claim is unsupported or implausible' },
  },
};

export const matchQuestion = (skill) => ({
  type: 'noul',
  instructions: `The CV shows hands on experience with ${skill}.`,
  criteria: { true: 'The CV demonstrates hands-on experience', false: 'The CV does not demonstrate hands-on experience' },
});
