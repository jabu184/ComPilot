' Starts the ComPilot Portable server silently in background and opens browser
Set WshShell = CreateObject("WScript.Shell")
scriptPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

WshShell.Run "cmd.exe /c cd /d """ & scriptPath & """ && (where node >nul 2>nul && node server.js || if exist node.exe (node.exe server.js)) > startup.log 2>&1", 0, False
WScript.Sleep 1000
WshShell.Run "http://localhost:3003"
