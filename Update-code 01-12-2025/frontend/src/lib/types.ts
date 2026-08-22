export interface Pool {
  name: string
  size: string
  allocated: string
  free: string
  health: string
}

export interface Dataset {
  name: string
  used: string
  available: string
  referenced: string
  mountpoint: string
  type: string
}

export interface Snapshot {
  name: string
  creation: string
  used: string
  referenced: string
}

export interface Target {
  iqn: string
  tpg_groups: string[]
  luns: Lun[]
  acls: string[]
  portals: Portal[]
  authentication: boolean
}

export interface Lun {
  id: string
  backstore: string
  path?: string
}

export interface Portal {
  ip: string
  port: string
}

export interface Schedule {
  id: number
  name: string
  dataset: string
  schedule_type: string
  cron_expression: string
  retention_days: number
  enabled: boolean
  last_run: string | null
  next_run: string | null
  created_at: string
}

export interface CompressionInfo {
  compression?: string
  compressratio?: string
}