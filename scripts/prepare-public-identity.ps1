# Limit identity changes to the automation-created initial/maintenance commits.
$ErrorActionPreference='Stop'
if($env:GITHUB_REPOSITORY -ne 'BIoodWork/CK3-DNA-Studio'){throw 'Unexpected repository.'}
$expected=$env:GITHUB_SHA
$root=(git rev-list --max-parents=0 HEAD).Trim()
$count=[int](git rev-list --count HEAD)
$message=(git log -1 --format=%s).Trim()
$rootMessage=(git log --reverse --format=%s | Select-Object -First 1)
git config user.name BIoodWork
git config user.email '351165458+BIoodWork@users.noreply.github.com'
$rewrite=$false
if($count -eq 2 -and $rootMessage -eq 'Initialize Studio repository with private-data exclusions' -and $message -eq 'Publish Crusader Kings III DNA Studio 1.0.1'){
 git checkout --orphan public-release-source
 if($LASTEXITCODE -ne 0){throw 'Cannot create public source history.'}
 git add --all
 git commit -m 'Release Crusader Kings III DNA Studio 1.0.1'
 if($LASTEXITCODE -ne 0){throw 'Cannot create public commit.'}
 $rewrite=$true
}elseif($message -like 'Fix release build:*'){
 if($env:GITHUB_ACTOR -ne 'BIoodWork' -or $count -gt 10 -or $rootMessage -ne 'Release Crusader Kings III DNA Studio 1.0.1'){throw 'Maintenance identity scope differs; no history changed.'}
 $commits=@(git rev-list --reverse "$root..HEAD")
 foreach($old in $commits){if((git log -1 --format=%s $old) -notlike 'Fix release build:*' -or @(((git log -1 --format=%P $old).Trim()) -split ' ').Count -ne 1){throw 'An unrelated commit exists; no history changed.'}}
 $env:GIT_AUTHOR_NAME='BIoodWork';$env:GIT_AUTHOR_EMAIL='351165458+BIoodWork@users.noreply.github.com'
 $env:GIT_COMMITTER_NAME=$env:GIT_AUTHOR_NAME;$env:GIT_COMMITTER_EMAIL=$env:GIT_AUTHOR_EMAIL
 $parent=$root
 foreach($old in $commits){$tree=(git log -1 --format=%T $old).Trim();$body=git log -1 --format=%B $old;$parent=($body | git commit-tree $tree -p $parent).Trim();if($LASTEXITCODE -ne 0){throw 'Cannot create public maintenance commit.'}}
 git checkout --detach $parent
 if($LASTEXITCODE -ne 0){throw 'Cannot select public maintenance commit.'}
 $rewrite=$true
}
if($rewrite){git push "--force-with-lease=refs/heads/main:$expected" origin HEAD:main;if($LASTEXITCODE -ne 0){throw 'Main changed concurrently; stopped.'}}
$head=(git rev-parse HEAD).Trim()
"STUDIO_RELEASE_COMMIT=$head" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
'Public release identity prepared.'
