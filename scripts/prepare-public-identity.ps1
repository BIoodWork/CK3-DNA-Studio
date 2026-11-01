# Used once for the API-created bootstrap history, which cannot specify authors.
# Never rewrites an unrelated repository or a concurrently changed branch.
$ErrorActionPreference='Stop'
if($env:GITHUB_REPOSITORY -ne 'BIoodWork/CK3-DNA-Studio'){ throw 'Unexpected release repository.' }
$expected=$env:GITHUB_SHA
$root=(git rev-list --max-parents=0 HEAD).Trim()
$count=[int](git rev-list --count HEAD)
$message=(git log -1 --format=%s).Trim()
$rootMessage=(git log --reverse --format=%s | Select-Object -First 1)
$rewriteRoot=($count -eq 2 -and $rootMessage -eq 'Initialize Studio repository with private-data exclusions' -and $message -eq 'Publish Crusader Kings III DNA Studio 1.0.1')
$rewriteHead=($message -like 'Fix release build:*' -and (git log -1 --format=%ae).Trim() -notmatch '@users\.noreply\.github\.com$')
if($rewriteRoot -or $rewriteHead){
 git config user.name BIoodWork
 git config user.email '351165458+BIoodWork@users.noreply.github.com'
 if($rewriteRoot){
  git checkout --orphan public-release-source
  if($LASTEXITCODE -ne 0){throw 'Cannot create clean source history.'}
  git add --all
  git commit -m 'Release Crusader Kings III DNA Studio 1.0.1'
 }else{
  git -c user.name=BIoodWork -c user.email='351165458+BIoodWork@users.noreply.github.com' commit --amend --no-edit --reset-author
 }
 if($LASTEXITCODE -ne 0){throw 'Cannot set public commit identity.'}
 git push "--force-with-lease=refs/heads/main:$expected" origin HEAD:main
 if($LASTEXITCODE -ne 0){throw 'Main changed concurrently; release was stopped.'}
}
$head=(git rev-parse HEAD).Trim()
"STUDIO_RELEASE_COMMIT=$head" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
'Public release commit identity prepared.'
