' Starts the Compilot Node.js server invisibly in the background
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd.exe /c cd /d ""c:\Users\vboxuser\ComPilot"" && node server.js > startup.log 2>&1", 0, False