export type SystemSettings = {
  platformName: string
  defaultPageSize: number
  rootUsername: string
  updatedAt: string
}

export type UpdateSystemSettingsInput = {
  platformName: string
  defaultPageSize: number
}

export type ChangeRootPasswordInput = {
  newPassword: string
  confirmNewPassword: string
}
