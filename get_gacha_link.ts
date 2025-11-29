// deno-lint-ignore-file no-explicit-any
async function chooseFolder(): Promise<string | null> {
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$ofd = New-Object System.Windows.Forms.OpenFileDialog
$ofd.CheckFileExists = $true
$ofd.ValidateNames = $false
$ofd.FileName = "launcher.exe" # trick
if ($ofd.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output ([System.IO.Path]::GetDirectoryName($ofd.FileName))
}
`
    const cmd = new Deno.Command('powershell', {
        args: ['-NoProfile', '-Command', psScript],
        stdout: 'piped'
    })

    const { stdout } = await cmd.output()
    const path = new TextDecoder().decode(stdout).trim()
    return path || null
}

function tryParseJson(text: string): any | null {
    const start = text.indexOf('{')
    let end = text.lastIndexOf('}')

    while (start !== -1 && end !== -1 && start < end) {
        const candidate = text.slice(start, end + 1)
        try {
            return JSON.parse(candidate)
        } catch {
            end--
        }
    }

    return null
}

async function findClientLog(dir: string): Promise<string | null> {
    for await (const entry of Deno.readDir(dir)) {
        const fullPath = `${dir}/${entry.name}`
        if (entry.isFile && entry.name === 'Client.log') {

            const normalized = fullPath.replaceAll('\\', '/')
            if (normalized.endsWith('Client/Saved/Logs/Client.log')) return fullPath
        }
        if (entry.isDirectory) {
            const result = await findClientLog(fullPath)
            if (result) return result
        }
    }
    return null
}

async function processLogFile(path: string) {
    const FEATURE = 'https://aki-gm-resources.aki-game.com/aki/gacha/index.html#/record?'
    using file = await Deno.open(path)
    const decoder = new TextDecoder()
    let buf = ''
    const resultJsons = []

    for await (const chunk of file.readable) {
        buf += decoder.decode(chunk, { stream: true })

        const lines = buf.split('\n')
        buf = lines.pop()!

        for (const line of lines) {
            if (line.includes(FEATURE)) {
                const json = tryParseJson(line)
                if (json) 
                    resultJsons.push(json)
            }
        }
    }

    if (buf.length > 0 && buf.includes(FEATURE)) {
        const json = tryParseJson(buf)
        if (json) 
            resultJsons.push(json)
    }

    return resultJsons
}

async function get_gocha_link() {
    console.log("请进入《鸣潮》启动器安装目录，然后随便选择一个文件")
    const folder = await chooseFolder()
    if (!folder) {
        alert('未选择文件夹')
        return
    }

    const logFile = await findClientLog(folder)
    if (!logFile) {
        alert('未找到符合路径的 Client.log 文件')
        return
    }

    async function readUrl() {
        const jsons = await processLogFile(logFile!)
        const urls = jsons.map(json => json.url).filter(Boolean)
        if (urls.length === 0) {
            alert('先打开抽卡记录界面，再按回车重试。')
            return await readUrl()
        }
        return urls
    }

    return [...new Set(await readUrl())]
}

async function main() {
    try {
        const urls = await get_gocha_link()
        console.log("以下可能是你的抽卡链接", urls)
    } catch (error) {
        console.error(error)
    }
    alert('已获取到抽卡记录链接。按回车键退出')
}

if (import.meta.main) {
    main()
}

export default get_gocha_link