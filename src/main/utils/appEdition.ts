import { readFileSync } from 'node:fs'

import { app } from 'electron'

import { application } from '@application'
import type { AppEdition } from '@shared/types/appEdition'

const APPLICATION_IDS = {
  global: 'com.kangfenmao.CherryStudio',
  cn: 'com.cherryai.cherrystudio.cn'
} as const satisfies Record<AppEdition, string>

function parseAppEdition(value: unknown): AppEdition {
  if (value === undefined || value === 'global') {
    return 'global'
  }
  if (value === 'cn') {
    return 'cn'
  }
  throw new Error(`Unsupported application edition: ${String(value)}`)
}

function resolveAppEdition(): AppEdition {
  const developmentEdition = process.env.CHERRY_EDITION?.trim().toLowerCase()
  if (!app.isPackaged && developmentEdition) {
    return parseAppEdition(developmentEdition)
  }

  return parseAppMetadata().edition
}

function parseAppMetadata() {
  const packageMetadata = JSON.parse(readFileSync(application.getPath('app.root', 'package.json'), 'utf8')) as {
    cherryEdition?: unknown
    cherryAppId?: unknown
  }
  return { edition: parseAppEdition(packageMetadata.cherryEdition), appId: packageMetadata.cherryAppId }
}

let cachedAppEdition: AppEdition | undefined

export function getAppEdition(): AppEdition {
  cachedAppEdition ??= resolveAppEdition()
  return cachedAppEdition
}

export function getApplicationId(): string {
  if (app.isPackaged) {
    const { appId } = parseAppMetadata()
    if (typeof appId === 'string' && appId.trim()) return appId
  }
  return APPLICATION_IDS[getAppEdition()]
}
