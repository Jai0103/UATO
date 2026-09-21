import type { EvaluationQuestionInput } from "@/lib/evaluation-firebase-api";

export const STANDARD_EVALUATION_TEMPLATE = "aga-course-evaluation-v2";

export const STANDARD_EVALUATION_SECTIONS = [
  "Course Content & Learning",
  "Trainer / Instructor",
  "Theory Training",
  "Practical Flight Training",
  "Training Environment & Facilities",
  "Overall Course Evaluation"
] as const;

const items: Array<[string, string, string]> = [
  ["06", "Course Content & Learning", "The learning objectives of the course were clearly explained."],
  ["07", "Course Content & Learning", "The course content was relevant to the learning objectives."],
  ["08", "Course Content & Learning", "The course content was well structured and easy to follow."],
  ["09", "Course Content & Learning", "The training materials and resources supported my learning effectively."],
  ["10", "Course Content & Learning", "The pace of the training was appropriate."],
  ["11", "Course Content & Learning", "The training improved my knowledge and understanding of UAS operations."],
  ["12", "Trainer / Instructor", "The trainer demonstrated good knowledge of the subject matter."],
  ["13", "Trainer / Instructor", "The trainer explained the topics clearly and effectively."],
  ["14", "Trainer / Instructor", "The trainer encouraged questions and learner participation."],
  ["15", "Trainer / Instructor", "The trainer responded to questions clearly and appropriately."],
  ["16", "Trainer / Instructor", "The trainer provided useful guidance and feedback throughout the training."],
  ["17", "Trainer / Instructor", "The trainer conducted the training in a professional manner."],
  ["18", "Trainer / Instructor", "Overall, the trainer was effective in supporting my learning."],
  ["19", "Theory Training", "The theory lessons helped me understand the key principles of UAS operations."],
  ["20", "Theory Training", "The explanations and examples used during the theory training were easy to understand."],
  ["21", "Theory Training", "The theory training adequately prepared me for the relevant UAPL theory requirements."],
  ["22", "Theory Training", "The quizzes, exercises or knowledge checks were useful in reinforcing my understanding."],
  ["23", "Practical Flight Training", "The practical training objectives and activities were clearly explained."],
  ["24", "Practical Flight Training", "Safety procedures and precautions were clearly communicated before flight activities."],
  ["25", "Practical Flight Training", "The instructor demonstrated the required flight manoeuvres clearly."],
  ["26", "Practical Flight Training", "I was given sufficient opportunity to practise the required flight manoeuvres."],
  ["27", "Practical Flight Training", "The instructor provided useful feedback to help improve my flight performance."],
  ["28", "Practical Flight Training", "The training equipment and UAS used were suitable for the practical training."],
  ["29", "Practical Flight Training", "The practical training improved my confidence in operating a UAS safely."],
  ["30", "Practical Flight Training", "The practical training adequately prepared me for the UAPL practical assessment requirements."],
  ["31", "Training Environment & Facilities", "The training venue/environment was suitable for learning."],
  ["32", "Training Environment & Facilities", "The training facilities were adequate for the course."],
  ["31-online", "Training Environment & Facilities", "The online training platform was suitable and easy to use."],
  ["32-online", "Training Environment & Facilities", "The audio, video and communication tools supported the training effectively."],
  ["33", "Training Environment & Facilities", "The equipment and training resources provided were suitable and available when required."],
  ["34", "Training Environment & Facilities", "The overall training environment was safe and conducive to learning."],
  ["35", "Overall Course Evaluation", "Overall, I am satisfied with the quality of the training provided."],
  ["36", "Overall Course Evaluation", "The training met my expectations."],
  ["37", "Overall Course Evaluation", "I feel better prepared to apply the knowledge and skills gained from this course."],
  ["38", "Overall Course Evaluation", "I would recommend this training programme to others."]
];

export const standardEvaluationQuestions: EvaluationQuestionInput[] = items.map(([number, section, text], index) => ({
  id: `aga-v2-q${number}`,
  templateId: STANDARD_EVALUATION_TEMPLATE,
  section,
  text,
  sortOrder: index,
  responseType: "rating",
  required: true,
  status: "active",
  scaleMin: 1,
  scaleMax: 5,
  scaleMinLabel: "Strongly disagree",
  scaleMaxLabel: "Strongly agree",
  options: []
}));

export function isStandardEvaluation(questions: Array<{ id: string }>) {
  return questions.some((question) => question.id.startsWith("aga-v2-q"));
}

export function isQuestionApplicable(
  question: { id: string; section: string },
  component: string,
  delivery: string
) {
  if (question.section === "Theory Training" && component === "Practical") return false;
  if (question.section === "Practical Flight Training" && component === "Theory") return false;
  if (question.id.endsWith("-online")) return component !== "Practical" && delivery === "Online synchronous";
  if (question.id === "aga-v2-q31" || question.id === "aga-v2-q32") {
    return component === "Practical" || delivery !== "Online synchronous";
  }
  return true;
}
