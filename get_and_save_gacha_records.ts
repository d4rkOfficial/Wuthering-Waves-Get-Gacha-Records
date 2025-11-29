// deno-lint-ignore-file ban-ts-comment no-import-prefix no-unversioned-import no-explicit-any
/// <reference lib="dom" />
import { chromium, Page } from 'npm:playwright'
import get_gocha_link from './get_gacha_link.ts'

interface GachaRecord {
    type: string
    name: string
    count: number
    time: string
    quality?: string
}

interface GachaRecordMap {
    [gachaType: string]: GachaRecord[]
}

const YELLOW = '\x1b[33m'
const PURPLE = '\x1b[35m'
const BLUE = '\x1b[34m'
const CLEAR = '\x1b[0m'

async function getContentSelector(page: Page): Promise<string> {
    const selectors = [
        '.content-x',
        '.record-table',
        '.app-content',
        '.content',
    ]
    for (const sel of selectors) {
        if (await page.$(sel)) return sel
    }
    return 'body'
}

async function waitTableChange(page: Page, oldHTML: string, selector: string) {
    await page
        .waitForFunction(
            // @ts-ignore
            (sel, prev) => {
                const el = document.querySelector(sel)
                if (!el) return false
                return el.innerHTML !== prev
            },
            selector,
            oldHTML
        )
        .catch(() => {})
}

async function parseRecordsFromPage(page: Page): Promise<GachaRecord[]> {
    const records = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.content-x'))
        return rows.map((row) => {
            const cols = row.querySelectorAll('.content-item p')
            return {
                type: cols[0]?.textContent.trim() || '',
                name: cols[1]?.textContent.trim() || '',
                count: Number(cols[2]?.textContent.trim() || 0),
                time: cols[3]?.textContent.trim() || '',
                quality: cols[1]?.className || undefined,
            }
        })
    })

    for (const r of records) {
        console.log(
            r.quality === 'quality5'
                ? YELLOW
                : r.quality === 'quality4'
                ? PURPLE
                : BLUE,
            `[${r.type}] ${r.name} x${r.count} @${r.time}`,
            CLEAR
        )
    }
    return records
}

async function collectAllPages(page: Page): Promise<GachaRecord[]> {
    const records: GachaRecord[] = []
    const selector = await getContentSelector(page)
    const PAGE_SIZE = 5
    let lastPageHash = ''

    while (true) {
        const contentEl = await page.$(selector)
        if (!contentEl) break

        const oldHTML = await contentEl.evaluate((el) => el.innerHTML)
        const pageRecs = await parseRecordsFromPage(page)
        if (!pageRecs || pageRecs.length === 0) break

        const pageHash = pageRecs
            .map((r) => `${r.type}|${r.name}|${r.time}`)
            .join('')
        if (pageHash === lastPageHash) break
        lastPageHash = pageHash

        records.push(...pageRecs)
        if (pageRecs.length < PAGE_SIZE) break

        const nextBtn = await page.$('.arrow-right.default-btn')
        if (!nextBtn) break
        if ((await nextBtn.getAttribute('disabled')) !== null) break

        await nextBtn.click()
        await waitTableChange(page, oldHTML, selector)
        await page.waitForTimeout(10)
    }

    return records
}

async function getDrawTypes(page: Page): Promise<string[]> {
    const dropdown = await page.$('.app-select-value')
    if (!dropdown) return []

    await dropdown.click()
    await page.waitForSelector('.app-select-list-label')
    const options = await page.$$eval('.app-select-list-label', (els) =>
        els.map((el) => el.textContent?.trim() || '').filter(Boolean)
    )
    await dropdown.click()
    return options
}

async function collectAllTypes(
    browser: any,
    baseUrl: string,
    types: string[]
): Promise<GachaRecordMap> {
    const result: GachaRecordMap = {}

    for (const typeName of types) {
        console.log(`\n抓取类型: ${typeName}`)
        const page = await browser.newPage()
        await page.goto(baseUrl, { waitUntil: 'networkidle' })

        const dropdown = await page.$('.app-select-value')
        if (!dropdown) {
            // unreachable
            console.log(`未找到类型下拉框, 跳过 ${typeName}`)
            await page.close()
            continue
        }
        await dropdown.click()
        await page.waitForSelector('.app-select-list-label')
        const option = await page.$(
            `.app-select-list-label:text("${typeName}")`
        )
        if (!option) {
            console.log(`未找到类型 ${typeName}, 跳过`)
            await page.close()
            continue
        }
        await option.click()

        await page.waitForTimeout(1600)

        const selector = await getContentSelector(page)
        const emptyEl = await page.$(
            '.app-table-content.empty .app-table-empty'
        )
        const recordEl = await page.$(`${selector} .content-x`)

        if (!recordEl && emptyEl) {
            console.log(`类型 ${typeName} 无记录`)
            await page.close()
            continue
        }

        const recs = await collectAllPages(page)
        if (recs.length > 0) result[typeName] = recs
        await page.close()
    }

    return result
}

async function main() {
    const urls = await get_gocha_link()
    if (!urls || urls.length === 0) {
        // unreachable
        return
    }

    const browser = await chromium.launch({ channel: 'msedge', headless: true })
    const page = await browser.newPage()

    console.log(`打开抽卡页面: ${urls[urls.length - 1]}`)
    await page.goto(urls[urls.length - 1], { waitUntil: 'networkidle' })

    console.log('\n获取所有唤取类型...')
    const types = await getDrawTypes(page)
    console.log('类型列表:', types)
    await page.close()

    console.log('\n开始抓取每个类型记录...')
    const allRecords = await collectAllTypes(
        browser,
        urls[urls.length - 1],
        types
    )

    console.log('\n抓取完成! 统计: ')
    for (const [type, recs] of Object.entries(allRecords)) {
        console.log(`- ${type}: ${recs.length} 条`)
    }

    await browser.close()
    console.log('\n浏览器已关闭.')

    const json = JSON.stringify(allRecords, null, 2)

    await Deno.writeTextFile(
        'gacha_records.json',
        json
    )
    console.log('已保存到 gacha_records.json')
}

if (import.meta.main) {
    await main()
}
