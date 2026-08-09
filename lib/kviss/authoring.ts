export interface QuestionBankDraft {
  text: string
  options: string[]
  correctOptionIndices: number[]
  durationSeconds: number
  pointWeight: number
  confidenceMode: boolean
  sortOrder: number
}

export interface QuestionBankItem extends QuestionBankDraft {
  id: string
  revision: number
  createdAt: string
  updatedAt: string
}

export interface QuizQuestion {
  id: string
  kind: 'quiz'
  text: string
  options: string[]
  correctOptionIndices: number[]
  durationSeconds: number
  pointWeight: number
  confidenceMode: boolean
  songSnapshot: null
  sourceQuestionId: string | null
  sourceQuestionRevision: number | null
}
