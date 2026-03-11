export type TelegramIntegration = {
  id: number
  name: string
  defaultChatId?: string
  webhookSecret?: string
  webhookPath?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type SaveTelegramIntegrationInput = {
  name: string
  botToken?: string
  defaultChatId?: string
  webhookSecret?: string
  isActive: boolean
}
