@echo off
rem Model uretir: model.cmd koltuk  |  yalniz bazilari: model.cmd koltuk taht
set "S=%~1"
shift
"%ProgramFiles%\Blender Foundation\Blender 5.3\blender.exe" -b -P "%~dp0blender\%S%.py" -- %1 %2 %3 %4 %5 %6 %7 %8 %9
