import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { type SerializedSchema } from '@tldraw/store'
import {
  DocumentRecordType,
  PageRecordType,
  TLDOCUMENT_ID,
  type TLPage,
  type TLPageId,
  type TLRecord,
  type TLShape,
  type TLStore
} from '@tldraw/tlschema'
import { getIndexAbove } from '@tldraw/utils'

import { createHeadlessStore, getDefaultStoreSchema } from './runtime.js'

const TLDRAW_FILE_FORMAT_VERSION = 1

const DEFAULT_SCHEMA = getDefaultStoreSchema()
const DEFAULT_PAGE_ID = PageRecordType.createId('page-1')
const DOCUMENT_RECORD_TYPES = new Set(['asset', 'binding', 'document', 'page', 'shape'])

type RawTldrawFile = {
  records: TLRecord[]
  schema: SerializedSchema
  tldrawFileFormatVersion: number
}

function createPageRecord(pageId: TLPageId = DEFAULT_PAGE_ID, name = 'Page 1'): TLPage {
  return PageRecordType.create({
    id: pageId,
    index: getIndexAbove(),
    name
  })
}

function ensureDocumentAndPage(store: TLStore): TLPageId {
  let firstPage: TLPage | null = null

  for (const record of store.allRecords()) {
    if (record.typeName === 'page') {
      const pageRecord = record as TLPage
      if (!firstPage || pageRecord.index < firstPage.index) {
        firstPage = pageRecord
      }
    }
  }

  const recordsToPut: TLRecord[] = []

  if (!store.get(TLDOCUMENT_ID)) {
    recordsToPut.push(
      DocumentRecordType.create({
        id: TLDOCUMENT_ID
      })
    )
  }

  if (!firstPage) {
    const pageRecord = createPageRecord()
    firstPage = pageRecord
    recordsToPut.push(pageRecord)
  }

  if (recordsToPut.length > 0) {
    store.put(recordsToPut)
  }

  return firstPage.id
}

function assertIsObject(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new Error(message)
  }
}

function parseRawFile(json: string): RawTldrawFile {
  let parsed: unknown

  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('File is not valid JSON')
  }

  assertIsObject(parsed, 'File is not a valid .tldr document')

  const version = parsed.tldrawFileFormatVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version <= 0) {
    throw new Error('Missing or invalid tldrawFileFormatVersion')
  }

  if (version > TLDRAW_FILE_FORMAT_VERSION) {
    throw new Error(`Unsupported .tldr file format version: ${version}.`)
  }

  const schema = parsed.schema
  assertIsObject(schema, 'Missing schema in .tldr file')

  const records = parsed.records
  if (!Array.isArray(records)) {
    throw new Error('Missing records in .tldr file')
  }

  for (const record of records) {
    assertIsObject(record, 'Invalid record in .tldr file')
    if (typeof record.id !== 'string' || typeof record.typeName !== 'string') {
      throw new Error('Invalid record in .tldr file')
    }
  }

  return {
    records: records as TLRecord[],
    schema: schema as unknown as SerializedSchema,
    tldrawFileFormatVersion: version
  }
}

function pruneUnusedAssets(records: TLRecord[]): TLRecord[] {
  const usedAssets = new Set<string>()

  for (const record of records) {
    if (
      record.typeName === 'shape' &&
      'assetId' in record.props &&
      typeof record.props.assetId === 'string'
    ) {
      usedAssets.add(record.props.assetId)
    }
  }

  return records.filter((record) => record.typeName !== 'asset' || usedAssets.has(record.id))
}

function getDocumentRecords(store: TLStore): TLRecord[] {
  return store
    .allRecords()
    .filter((record): record is TLRecord => DOCUMENT_RECORD_TYPES.has(record.typeName))
}

export function createEmptyStore(name?: string): { pageId: TLPageId; store: TLStore } {
  const store = createHeadlessStore()

  const page = createPageRecord()
  const document = DocumentRecordType.create({
    id: TLDOCUMENT_ID,
    ...(name ? { name } : {})
  })

  store.put([document, page])

  return {
    pageId: page.id,
    store
  }
}

export async function readTldrawFile(filePath: string): Promise<TLStore> {
  const json = await readFile(filePath, 'utf8')
  const rawFile = parseRawFile(json)

  const storeSnapshot = Object.fromEntries(rawFile.records.map((record) => [record.id, record]))
  const migrationResult = DEFAULT_SCHEMA.migrateStoreSnapshot({
    schema: rawFile.schema,
    store: storeSnapshot
  })

  if (migrationResult.type !== 'success') {
    throw new Error(`Unable to migrate .tldr file: ${migrationResult.reason}. (${filePath})`)
  }

  const store = createHeadlessStore()
  store.loadStoreSnapshot({
    schema: DEFAULT_SCHEMA.serialize(),
    store: migrationResult.value
  })

  ensureDocumentAndPage(store)
  return store
}

export async function writeTldrawFile(filePath: string, store: TLStore): Promise<void> {
  ensureDocumentAndPage(store)

  const records = pruneUnusedAssets(getDocumentRecords(store))

  const payload = JSON.stringify(
    {
      records,
      schema: store.schema.serialize(),
      tldrawFileFormatVersion: TLDRAW_FILE_FORMAT_VERSION
    },
    null,
    2
  )

  const parentDir = dirname(filePath)
  const tempFilePath = join(
    parentDir,
    `.${Math.random().toString(16).slice(2)}.${process.pid}.${Date.now()}.tmp`
  )

  await mkdir(parentDir, { recursive: true })
  await writeFile(tempFilePath, `${payload}\n`, 'utf8')
  await rename(tempFilePath, filePath)
}

export function getPages(store: TLStore): TLPage[] {
  return store
    .allRecords()
    .filter((record): record is TLPage => record.typeName === 'page')
    .sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0))
}

export function getCurrentPageId(store: TLStore): TLPageId {
  const pages = getPages(store)
  const firstPage = pages[0]

  if (!firstPage) {
    return ensureDocumentAndPage(store)
  }

  return firstPage.id
}

export function getShapesOnPage(store: TLStore, pageId: TLPageId): TLShape[] {
  return store
    .allRecords()
    .filter((record): record is TLShape => record.typeName === 'shape' && record.parentId === pageId)
}
