# To bootstrap self-hosted Windows runners do this first in
# powershell as administrator:
Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope AllUsers
Install-Module -Name Microsoft.PowerShell.Archive -MinimumVersion 1.2.5 -Scope AllUsers -SkipPublisherCheck
Install-Module -Name Microsoft.WinGet.Client -Force -Scope AllUsers
Install-Module -Name Git -MinimumVersion 2.42 -Force -Scope AllUsers -SkipPublisherCheck
winget install -e --id Git.Git  --accept-source-agreements --accept-package-agreements

# Enable long paths, see https://github.com/actions/checkout/issues/1985
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" `
-Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
