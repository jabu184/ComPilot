' Starts the Compilot Node.js server invisibly in the background
Set WshShell = CreateObject("WScript.Shell")
scriptPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "cmd.exe /c cd /d """ & scriptPath & """ && node server.js > startup.log 2>&1", 0, False