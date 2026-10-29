# Фан-сайт «О моём перерождении в слизь»
# Сайт открывается по имени http://slime.localhost/ (адрес можно сменить: -Name мой.localhost; без имени: -NoName)
# Только на этом компьютере:  powershell -ExecutionPolicy Bypass -File .\start.ps1
# С телефона (та же Wi-Fi сеть): powershell -ExecutionPolicy Bypass -File .\start.ps1 -Share
# Ссылка для друзей из любой сети: powershell -ExecutionPolicy Bypass -File .\start.ps1 -Public
# Бесплатная постоянная ссылка для всех: powershell -ExecutionPolicy Bypass -File .\start.ps1 -Funnel
# Личный бесплатный адрес (только твои устройства): powershell -ExecutionPolicy Bypass -File .\start.ps1 -Tailscale
# Свой домен (один раз):          powershell -ExecutionPolicy Bypass -File .\start.ps1 -Setup -Domain slime.example.com
# Сайт существует, пока работает это окно PowerShell. Ctrl+C - остановить.
param(
    [int]$Port = 0,
    [string]$Name = 'slime.localhost',
    [switch]$NoName,
    [switch]$Share,
    [switch]$Public,
    [switch]$Tailscale,
    [switch]$Funnel,
    [switch]$Setup,
    [string]$Domain = '',
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'www'))
if (-not (Test-Path $Root)) {
    Write-Host 'Не найдена папка www рядом со start.ps1' -ForegroundColor Red
    exit 1
}

function Test-Admin {
    ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Общий доступ (-Share) требует прав администратора: Windows не даёт слушать сеть без них.
$NeedAdmin = ($Share -or $Tailscale -or $Funnel -or ((-not $NoName) -and $Name)) -and (-not $Setup)
if ($NeedAdmin -and -not (Test-Admin)) {
    Write-Host '  Для имени сайта и общего доступа нужны права администратора. Открываю новое окно, нажми "Да".' -ForegroundColor Yellow
    $flags = ''
    if ($Share) { $flags += ' -Share' }
    if ($Tailscale) { $flags += ' -Tailscale' }
    if ($Funnel) { $flags += ' -Funnel' }
    if ($Public) { $flags += ' -Public' }
    if ($NoName) { $flags += ' -NoName' } else { $flags += ' -Name "' + $Name + '"' }
    if ($Port -gt 0) { $flags += ' -Port ' + $Port }
    if ($NoBrowser) { $flags += ' -NoBrowser' }
    Start-Process powershell -Verb RunAs -ArgumentList ('-NoExit -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"' + $flags)
    exit
}

# Сторонние API спрятаны за короткими буквами: браузер видит только /s/a/..., настоящие адреса знает один этот скрипт.
# Нужен ещё один источник - добавь букву и адрес сюда (и используй её в www/app.js или плагине).
$Upstreams = @{
    'a' = 'https://api.jikan.moe/v4'
    'b' = 'https://shikimori.one'
    'c' = 'https://shikimori.io'
    'd' = 'https://shikimori.me'
    'e' = 'https://anilibria.top/api/v1'
    'f' = 'https://aniliberty.top/api/v1'
}

$CfgPath = Join-Path $PSScriptRoot 'site.config.json'
$Cfg = $null
if (Test-Path $CfgPath) {
    try { $Cfg = Get-Content -Path $CfgPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $Cfg = $null }
}
if ($Funnel -and -not ($Cfg -and $Cfg.accessKey)) {
    $obj = @{}
    if ($Cfg) { $Cfg.PSObject.Properties | ForEach-Object { $obj[$_.Name] = $_.Value } }
    $obj['accessKey'] = [guid]::NewGuid().ToString('N')
    $obj | ConvertTo-Json | Set-Content -Path $CfgPath -Encoding UTF8
    $Cfg = [pscustomobject]$obj
}
$Token = [guid]::NewGuid().ToString('N')
# Со своим доменом ключ в ссылке постоянный, чтобы ссылка не менялась.
if ($Cfg -and $Cfg.accessKey) { $Token = [string]$Cfg.accessKey }
$Cache = @{}
$script:LastJikan = [datetime]::MinValue
$script:Fails = @{}

# Код для входа с других устройств (6 цифр, новый при каждом запуске)
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$buf = New-Object byte[] 4
$rng.GetBytes($buf)
$Code = '{0:D6}' -f ([BitConverter]::ToUInt32($buf, 0) % 1000000)

$LoginHtml = @'
<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Врата закрыты</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:radial-gradient(900px 600px at 30% 10%,#1b5fb8,#061634 70%);color:#e9fcff;font-family:'Segoe UI',system-ui,sans-serif}
form{max-width:380px;width:100%;padding:28px;border:1px solid rgba(135,225,255,.4);background:rgba(4,20,52,.78);box-shadow:0 0 40px rgba(60,180,255,.3)}
h1{margin:0 0 8px;font-size:1.3rem;color:#ffd24a}
p{margin:0 0 14px;line-height:1.5}
.err{color:#ff9aa8;min-height:1.5em}
input{width:100%;padding:14px;font-size:1.6rem;letter-spacing:.4em;text-align:center;border-radius:999px;border:1.5px solid #8fe0ff;background:#06214f;color:#fff}
button{margin-top:14px;width:100%;padding:12px;border:0;border-radius:999px;background:#59c8ff;color:#06306a;font-weight:800;font-size:1rem}
</style></head><body>
<form method="post" action="/login"><h1>Врата закрыты</h1><p>Введи код из окна PowerShell, где запущен сайт.</p><p class="err">{{MSG}}</p><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" autofocus><button>Войти</button></form>
</body></html>
'@

$Mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.webp' = 'image/webp'
    '.ico'  = 'image/x-icon'
    '.woff2' = 'font/woff2'
}

# ---------- запуск сервера на свободном порту ----------
$UseName = (-not $NoName) -and [bool]$Name
$candidates = if ($Port -gt 0) { $Port..($Port + 19) } else { @(80) + (8765..8784) }
$listener = $null
foreach ($p in $candidates) {
    $l = New-Object System.Net.HttpListener
    if ($Share -or $Tailscale -or $Funnel) { $l.Prefixes.Add("http://+:$p/") } else {
        $l.Prefixes.Add("http://127.0.0.1:$p/")
        $l.Prefixes.Add("http://localhost:$p/")
        if ($UseName) { $l.Prefixes.Add("http://${Name}:$p/") }
    }
    try {
        $l.Start()
        $listener = $l
        $Port = $p
        break
    } catch {
        $l.Close()
    }
}
if (-not $listener) {
    Write-Host 'Не удалось занять порт. Закрой другие копии сайта, запусти от имени администратора или добавь -NoName.' -ForegroundColor Red
    exit 1
}

# ---------- помощники ----------
function Send-Bytes {
    param($Ctx, [byte[]]$Bytes, [string]$Type, [int]$Code = 200)
    $res = $Ctx.Response
    $res.StatusCode = $Code
    $res.ContentType = $Type
    $res.Headers.Add('Cache-Control', 'no-store')
    $res.Headers.Add('X-Content-Type-Options', 'nosniff')
    $res.ContentLength64 = $Bytes.Length
    $res.OutputStream.Write($Bytes, 0, $Bytes.Length)
    $res.OutputStream.Close()
}

function Send-Text {
    param($Ctx, [string]$Text, [string]$Type = 'text/plain; charset=utf-8', [int]$Code = 200)
    Send-Bytes -Ctx $Ctx -Bytes ([Text.Encoding]::UTF8.GetBytes($Text)) -Type $Type -Code $Code
}

# Прокси к сторонним API: /s/<буква>/<путь>
function Invoke-Proxy {
    param($Ctx)
    $json = 'application/json; charset=utf-8'
    $m = [regex]::Match($Ctx.Request.RawUrl, '^/s/([a-z])/([^?]*)(\?.*)?$')
    if (-not $m.Success -or $m.Groups[2].Value -match '\.\.') {
        Send-Text $Ctx '{"error":"bad request"}' $json 400
        return
    }
    $base = $Upstreams[$m.Groups[1].Value]
    if (-not $base) {
        Send-Text $Ctx '{"error":"unknown source"}' $json 404
        return
    }
    $uri = $null
    if (-not [Uri]::TryCreate(($base + '/' + $m.Groups[2].Value + $m.Groups[3].Value), [UriKind]::Absolute, [ref]$uri) -or $uri.Host -ne ([Uri]$base).Host -or $uri.Scheme -ne 'https') {
        Send-Text $Ctx '{"error":"forbidden"}' $json 403
        return
    }

    $key = $uri.AbsoluteUri
    $hit = $Cache[$key]
    if ($hit -and $hit.Fail -and ((Get-Date) - $hit.Time).TotalSeconds -lt 90) {
        Send-Text $Ctx '{"error":"upstream failed (cached)"}' $json 502
        return
    }
    if ($hit -and -not $hit.Fail -and ((Get-Date) - $hit.Time).TotalMinutes -lt 60) {
        Send-Bytes -Ctx $Ctx -Bytes $hit.Bytes -Type $json
        return
    }

    # Jikan просит не чаще ~3 запросов в секунду
    if ($uri.Host -eq 'api.jikan.moe') {
        $wait = 450 - ((Get-Date) - $script:LastJikan).TotalMilliseconds
        if ($wait -gt 0) { Start-Sleep -Milliseconds ([int]$wait) }
    }

    try {
        $resp = Invoke-WebRequest -Uri $key -UseBasicParsing -TimeoutSec 7 -Headers @{
            'User-Agent' = 'SlimeFanSite/1.0'
            'Accept'     = 'application/json'
        }
        $bytes = $resp.RawContentStream.ToArray()
        $Cache[$key] = @{ Time = (Get-Date); Bytes = $bytes }
        Write-Host ("  + " + $uri.Host + $uri.PathAndQuery) -ForegroundColor DarkGray
        Send-Bytes -Ctx $Ctx -Bytes $bytes -Type $json
    } catch {
        Write-Host ("  ! " + $key + " -> " + $_.Exception.Message) -ForegroundColor Yellow
        $Cache[$key] = @{ Time = (Get-Date); Bytes = $null; Fail = $true }
        Send-Text $Ctx '{"error":"upstream failed"}' $json 502
    } finally {
        if ($uri.Host -eq 'api.jikan.moe') { $script:LastJikan = Get-Date }
    }
}

function Invoke-Request {
    param($Ctx)
    $req = $Ctx.Request
    $path = $req.Url.AbsolutePath

    if (-not ($Share -or $Tailscale -or $Funnel) -and (@('127.0.0.1', 'localhost', $Name) -notcontains $req.Url.Host)) {
        Send-Text $Ctx 'Forbidden' 'text/plain; charset=utf-8' 403
        return
    }

    # Проверка ключа запуска
    $cookie = $req.Cookies['slime_token']
    $ok = ($null -ne $cookie) -and ($cookie.Value -eq $Token)
    # Через Tailscale Serve приходят только твои устройства: Tailscale сам ставит заголовок с твоим логином.
    if (-not $ok -and $Tailscale -and [Net.IPAddress]::IsLoopback($req.RemoteEndPoint.Address) -and $req.Headers['Tailscale-User-Login']) { $ok = $true }
    if (-not $ok) {
        if ($req.QueryString['t'] -eq $Token) {
            $Ctx.Response.Headers.Add('Set-Cookie', "slime_token=$Token; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000")
            $Ctx.Response.StatusCode = 302
            $Ctx.Response.RedirectLocation = '/'
            $Ctx.Response.Close()
            return
        }
        if (($Share -or $Tailscale) -and -not $Funnel) {
            $ip = $req.RemoteEndPoint.Address.ToString()
            $f = $script:Fails[$ip]
            $locked = $f -and $f.Until -gt (Get-Date)
            $html = 'text/html; charset=utf-8'
            if ($req.HttpMethod -eq 'POST' -and $path -eq '/login') {
                if ($locked) {
                    Send-Text $Ctx $LoginHtml.Replace('{{MSG}}', 'Слишком много попыток. Подожди 5 минут.') $html 429
                    return
                }
                $body = ''
                if ($req.ContentLength64 -lt 200) {
                    $sr = New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8)
                    $body = $sr.ReadToEnd()
                }
                $given = ''
                if ($body -match '(?:^|&)code=([^&]*)') { $given = [Uri]::UnescapeDataString($Matches[1].Replace('+', ' ')).Trim() }
                if ($given -eq $Code) {
                    $script:Fails.Remove($ip)
                    $Ctx.Response.Headers.Add('Set-Cookie', "slime_token=$Token; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400")
                    $Ctx.Response.StatusCode = 302
                    $Ctx.Response.RedirectLocation = '/'
                    $Ctx.Response.Close()
                    return
                }
                if (-not $f) { $f = @{ N = 0; Until = [datetime]::MinValue }; $script:Fails[$ip] = $f }
                $f.N++
                if ($f.N -ge 5) { $f.Until = (Get-Date).AddMinutes(5); $f.N = 0 }
                Write-Host ("  ! неверный код с " + $ip) -ForegroundColor Yellow
                Send-Text $Ctx $LoginHtml.Replace('{{MSG}}', 'Неверный код.') $html 403
                return
            }
            if ($req.HttpMethod -eq 'GET' -and $path -eq '/') {
                Send-Text $Ctx $LoginHtml.Replace('{{MSG}}', '') $html
                return
            }
        }
        Send-Text $Ctx 'Доступ закрыт. Сайт открывается только через start.ps1 в PowerShell.' 'text/plain; charset=utf-8' 403
        return
    }

    if ($path.StartsWith('/s/')) { Invoke-Proxy $Ctx; return }

    if ($path -eq '/api/plugins') {
        $dir = Join-Path $Root 'plugins'
        $names = @()
        if (Test-Path $dir) {
            $names = @(Get-ChildItem -Path $dir -Filter '*.js' -File | Sort-Object Name | ForEach-Object { '"/plugins/' + $_.Name + '"' })
        }
        Send-Text $Ctx ('[' + ($names -join ',') + ']') 'application/json; charset=utf-8'
        return
    }

    # Статические файлы
    if ($path -eq '/') { $path = '/index.html' }
    $rel = ([Uri]::UnescapeDataString($path)).TrimStart('/').Replace('/', '\')
    $full = [IO.Path]::GetFullPath((Join-Path $Root $rel))
    if (-not $full.StartsWith($Root + '\', [StringComparison]::OrdinalIgnoreCase)) {
        Send-Text $Ctx 'Forbidden' 'text/plain; charset=utf-8' 403
        return
    }
    if (-not (Test-Path $full -PathType Leaf)) {
        Send-Text $Ctx 'Не найдено' 'text/plain; charset=utf-8' 404
        return
    }
    $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
    $type = $Mime[$ext]
    if (-not $type) { $type = 'application/octet-stream' }
    Send-Bytes -Ctx $Ctx -Bytes ([IO.File]::ReadAllBytes($full)) -Type $type
}

# ---------- публичная ссылка через Cloudflare Quick Tunnel ----------
function Read-Shared([string]$Path) {
    try {
        $fs = [IO.File]::Open($Path, 'Open', 'Read', 'ReadWrite')
        try { $sr = New-Object IO.StreamReader($fs); return $sr.ReadToEnd() } finally { $fs.Close() }
    } catch { return '' }
}

function Get-Cloudflared {
    $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $dir = Join-Path $PSScriptRoot 'tools'
    $exe = Join-Path $dir 'cloudflared.exe'
    if ((Test-Path $exe) -and ((Get-Item $exe).Length -gt 1MB)) { return $exe }
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Write-Host '  Скачиваю cloudflared от Cloudflare (один раз, около 20 МБ)...' -ForegroundColor Cyan
    Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $exe -UseBasicParsing
    return $exe
}

function Get-Tunnel($exe, $name) {
    try {
        $j = (& $exe tunnel list --output json 2>$null) -join "`n"
        if ($j) { return ($j | ConvertFrom-Json) | Where-Object { $_.name -eq $name } | Select-Object -First 1 }
    } catch {}
    return $null
}

# ---------- одноразовая настройка своего домена ----------
if ($Setup) {
    $listener.Close()
    $Domain = $Domain.Trim().ToLowerInvariant()
    if ($Domain -notmatch '^[a-z0-9-]+(\.[a-z0-9-]+)+$') {
        Write-Host '  Укажи домен: .\start.ps1 -Setup -Domain slime.example.com' -ForegroundColor Yellow
        exit 1
    }
    $exe = Get-Cloudflared
    $cfDir = Join-Path $env:USERPROFILE '.cloudflared'
    if (-not (Test-Path (Join-Path $cfDir 'cert.pem'))) {
        Write-Host '  Сейчас откроется браузер: войди в Cloudflare, выбери свой домен и нажми Authorize.' -ForegroundColor Cyan
        & $exe tunnel login
    }
    if (-not (Test-Path (Join-Path $cfDir 'cert.pem'))) {
        Write-Host '  Вход в Cloudflare не завершён. Повтори команду.' -ForegroundColor Yellow
        exit 1
    }
    $name = 'slime-site'
    $t = Get-Tunnel $exe $name
    if (-not $t) {
        & $exe tunnel create $name
        $t = Get-Tunnel $exe $name
    }
    if (-not $t) {
        Write-Host '  Не удалось создать туннель в Cloudflare.' -ForegroundColor Yellow
        exit 1
    }
    & $exe tunnel route dns --overwrite-dns $name $Domain
    if ($LASTEXITCODE -ne 0) {
        Write-Host '  Не удалось привязать домен. Домен должен быть добавлен в твой аккаунт Cloudflare.' -ForegroundColor Yellow
        exit 1
    }
    $key = if ($Cfg -and $Cfg.accessKey) { [string]$Cfg.accessKey } else { [guid]::NewGuid().ToString('N') }
    @{ domain = $Domain; tunnelId = [string]$t.id; accessKey = $key } | ConvertTo-Json | Set-Content -Path $CfgPath -Encoding UTF8
    Write-Host ''
    Write-Host '  Готово. Теперь запускай:  .\start.ps1 -Public' -ForegroundColor Green
    Write-Host "  Твоя постоянная ссылка:   https://$Domain/?t=$key" -ForegroundColor Green
    Write-Host ''
    exit 0
}

$tunnel = $null
$tsProc = $null

# ---------- старт ----------
$LocalHost = if ($UseName) { $Name } else { '127.0.0.1' }
$PortPart = if ($Port -eq 80) { '' } else { ":$Port" }
$Url = "http://$LocalHost$PortPart/?t=$Token"
Write-Host ''
Write-Host '  Уведомление. Запрос подтверждён.' -ForegroundColor Cyan
Write-Host '  Ответ. Врата открыты.' -ForegroundColor Cyan
Write-Host ''
Write-Host "  Сайт на этом ПК: http://$LocalHost$PortPart/"
$fwName = "SlimeSite-$Port"
if ($Share) {
    try {
        New-NetFirewallRule -DisplayName $fwName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Any | Out-Null
    } catch {
        Write-Host '  Не удалось открыть порт в брандмауэре, телефон может не подключиться.' -ForegroundColor Yellow
    }
    $ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.InterfaceAlias -notmatch 'vEthernet|VMware|VirtualBox|Loopback|Bluetooth' } |
        Select-Object -ExpandProperty IPAddress)
    Write-Host ''
    Write-Host '  С телефона или другого ПК (та же Wi-Fi сеть), открой в браузере:' -ForegroundColor Green
    foreach ($ip in $ips) { Write-Host "      http://${ip}:$Port/" -ForegroundColor Green }
    Write-Host "  Код для входа: $Code" -ForegroundColor Green
    Write-Host ''
}
if (-not $NoBrowser) { Start-Process $Url }

try {
    if ($Tailscale -or $Funnel) {
        try {
            $ts = $null
            $cmd = Get-Command tailscale -ErrorAction SilentlyContinue
            if ($cmd) { $ts = $cmd.Source }
            elseif (Test-Path 'C:\Program Files\Tailscale\tailscale.exe') { $ts = 'C:\Program Files\Tailscale\tailscale.exe' }
            if (-not $ts) {
                Write-Host '  Tailscale не найден. Установи его (tailscale.com/download) на этот ПК и телефон, войди одним аккаунтом и запусти снова.' -ForegroundColor Yellow
            } else {
                $o = Join-Path $env:TEMP "slime-ts-$Port.out"
                $e = Join-Path $env:TEMP "slime-ts-$Port.err"
                Remove-Item $o, $e -ErrorAction SilentlyContinue
                $tsProc = Start-Process -FilePath $ts -ArgumentList @($(if ($Funnel) { 'funnel' } else { 'serve' }), [string]$Port) -RedirectStandardOutput $o -RedirectStandardError $e -WindowStyle Hidden -PassThru
                Start-Sleep -Seconds 3
                $txt = (Read-Shared $o) + (Read-Shared $e)
                $addr = $null
                if ($txt -match 'https://[\w.-]+\.ts\.net') { $addr = $Matches[0] }
                else {
                    try {
                        $st = ((& $ts status --json 2>$null) -join "`n") | ConvertFrom-Json
                        $dns = ([string]$st.Self.DNSName).TrimEnd('.')
                        if ($dns) { $addr = "https://$dns" }
                    } catch {}
                }
                if ($addr -and $Funnel) {
                    $shareLink = "$addr/?t=$Token"
                    Write-Host ''
                    Write-Host '  Постоянная ссылка для всех, кому ты её отправишь (из любой сети, пока открыто это окно):' -ForegroundColor Green
                    Write-Host "      $shareLink" -ForegroundColor Green
                    try { Set-Clipboard -Value $shareLink; Write-Host '  (ссылка скопирована в буфер обмена)' -ForegroundColor Green } catch {}
                    Write-Host ''
                } elseif ($addr) {
                    Write-Host ''
                    Write-Host '  Твой личный адрес (открывается только на твоих устройствах с Tailscale):' -ForegroundColor Green
                    Write-Host "      $addr/" -ForegroundColor Green
                    Write-Host "  Запасной вход, если попросит код: $Code" -ForegroundColor Green
                    Write-Host ''
                } else {
                    Write-Host '  Адрес Tailscale получить не удалось. Ответ Tailscale:' -ForegroundColor Yellow
                    if ($txt.Trim()) { Write-Host $txt.Trim() -ForegroundColor Yellow }
                    Write-Host '  Проверь: вход в Tailscale выполнен, в админке Tailscale включены MagicDNS и HTTPS-сертификаты, а для Funnel открой ссылку из ответа выше и разреши его.' -ForegroundColor Yellow
                }
            }
        } catch {
            Write-Host ('  Tailscale не запустился: ' + $_.Exception.Message) -ForegroundColor Yellow
        }
    }
    if ($Public) {
        try {
            $exe = Get-Cloudflared
            $named = $Cfg -and $Cfg.domain -and $Cfg.tunnelId
            if ($named) {
                $yml = Join-Path $env:TEMP "slime-tunnel-$Port.yml"
                $cred = Join-Path $env:USERPROFILE (".cloudflared\" + $Cfg.tunnelId + ".json")
                $text = "tunnel: $($Cfg.tunnelId)`ncredentials-file: '$cred'`ningress:`n  - hostname: $($Cfg.domain)`n    service: http://127.0.0.1:$Port`n    originRequest:`n      httpHostHeader: 127.0.0.1:$Port`n  - service: http_status:404`n"
                [IO.File]::WriteAllText($yml, $text, (New-Object Text.UTF8Encoding($false)))
                $errFile = Join-Path $env:TEMP "slime-tunnel-$Port.err"
                $outFile = Join-Path $env:TEMP "slime-tunnel-$Port.out"
                Remove-Item $errFile, $outFile -ErrorAction SilentlyContinue
                Write-Host "  Подключаю домен $($Cfg.domain)..." -ForegroundColor Cyan
                $tunnel = Start-Process -FilePath $exe -ArgumentList @('tunnel', '--no-autoupdate', '--config', $yml, 'run', [string]$Cfg.tunnelId) -RedirectStandardError $errFile -RedirectStandardOutput $outFile -WindowStyle Hidden -PassThru
                $ready = $false
                for ($i = 0; $i -lt 60 -and -not $ready; $i++) {
                    Start-Sleep -Milliseconds 500
                    if ($tunnel.HasExited) { break }
                    if ((Read-Shared $errFile) -match 'Registered tunnel connection') { $ready = $true }
                }
                $shareLink = "https://$($Cfg.domain)/?t=$Token"
                if ($ready) {
                    Write-Host ''
                    Write-Host '  Постоянная ссылка (из любой сети, пока открыто это окно):' -ForegroundColor Green
                    Write-Host "      $shareLink" -ForegroundColor Green
                    try { Set-Clipboard -Value $shareLink; Write-Host '  (ссылка скопирована в буфер обмена)' -ForegroundColor Green } catch {}
                    Write-Host ''
                } else {
                    Write-Host '  Туннель домена не подключился. Проверь интернет и повтори -Setup, если менял домен.' -ForegroundColor Yellow
                }
            } else {
            $errFile = Join-Path $env:TEMP "slime-tunnel-$Port.err"
            $outFile = Join-Path $env:TEMP "slime-tunnel-$Port.out"
            Remove-Item $errFile, $outFile -ErrorAction SilentlyContinue
            Write-Host '  Открываю публичную ссылку, подожди несколько секунд...' -ForegroundColor Cyan
            $tunnel = Start-Process -FilePath $exe -ArgumentList @('tunnel', '--no-autoupdate', '--url', "http://127.0.0.1:$Port", '--http-host-header', "127.0.0.1:$Port") -RedirectStandardError $errFile -RedirectStandardOutput $outFile -WindowStyle Hidden -PassThru
            $pub = $null
            for ($i = 0; $i -lt 60 -and -not $pub; $i++) {
                Start-Sleep -Milliseconds 500
                if ($tunnel.HasExited) { break }
                if ((Read-Shared $errFile) -match 'https://(?!api\.)[\w-]+\.trycloudflare\.com') { $pub = $Matches[0] }
            }
            if ($pub) {
                $shareLink = "$pub/?t=$Token"
                Write-Host ''
                Write-Host '  Ссылка для друзей (из любой сети, пока открыто это окно):' -ForegroundColor Green
                Write-Host "      $shareLink" -ForegroundColor Green
                Write-Host '  Кто получил эту ссылку целиком, тот заходит без кода. Ссылка меняется при каждом запуске.' -ForegroundColor Green
                try { Set-Clipboard -Value $shareLink; Write-Host '  (ссылка скопирована в буфер обмена)' -ForegroundColor Green } catch {}
                Write-Host ''
            } else {
                Write-Host '  Не удалось получить публичную ссылку. Проверь интернет, антивирус и VPN. Сайт на этом ПК работает.' -ForegroundColor Yellow
            }
            }
        } catch {
            Write-Host ('  Туннель не запустился: ' + $_.Exception.Message) -ForegroundColor Yellow
        }
    }
    Write-Host '  Остановить: Ctrl+C (или закрой это окно)'
    Write-Host ''
    while ($listener.IsListening) {
        $ar = $listener.BeginGetContext($null, $null)
        # ждём запрос короткими отрезками, чтобы Ctrl+C срабатывал сразу
        while (-not $ar.AsyncWaitHandle.WaitOne(300)) { }
        $ctx = $listener.EndGetContext($ar)
        try {
            Invoke-Request $ctx
        } catch {
            Write-Host ("  ! " + $_.Exception.Message) -ForegroundColor Yellow
            try { Send-Text $ctx ('Ошибка: ' + $_.Exception.Message) 'text/plain; charset=utf-8' 500 } catch {}
        }
    }
} finally {
    if ($tsProc -and -not $tsProc.HasExited) { Stop-Process -Id $tsProc.Id -Force -ErrorAction SilentlyContinue }
    if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue }
    if ($Share) { Remove-NetFirewallRule -DisplayName $fwName -ErrorAction SilentlyContinue }
    $listener.Stop()
    $listener.Close()
    Write-Host ''
    Write-Host '  Врата закрыты. Сайт больше недоступен.' -ForegroundColor Cyan
}
