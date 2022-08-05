#!/usr/bin/env groovy

def installBuildRequirements() {
  def nodeHome = tool 'nodejs-lts'
  env.PATH = "${env.PATH}:${nodeHome}/bin"
  // install yarn
  sh 'corepack enable'
  sh 'yarn --version'
}
def vsix_glob = '**.vsix'
def node_name = 'rhel8'
def stash_name = 'vsix'
def gh_org = 'ansible'
def gh_repo = 'vscode-ansible'
def gh_branch = params.BRANCH ?: 'main'
// publishing is safe as we have manual approval step
def publishToMarketPlace = true
def publishPreRelease = true
def version = '0.0.0'
def upload_location = 'tools@filemgmt.jboss.org:/downloads_htdocs/tools/vscode'

node(node_name) {
    stage('checkout') {
    deleteDir()
    git url: "https://github.com/${gh_org}/${gh_repo}", branch: gh_branch
    // if a tagged with something not containing "next", we will consider it a release
    publishPreRelease = sh(
              script: 'git describe --exact-match --tags HEAD 2>/dev/null | grep -v next',
              returnStatus: true
          )
    echo "Determined publishPreRelease=${publishPreRelease}"
    def packageJson = readJSON file: 'package.json'
    version = packageJson.version[0..packageJson.version.lastIndexOf('.') - 1] + ".${env.BUILD_NUMBER}"
    echo "Determined version=${version}"

    currentBuild.displayName = version + (publishPreRelease ? '' : ' 🏁')
    }

    stage('requirements') {
      installBuildRequirements()
    }

    stage('build') {
      sh 'yarn install'
      sh 'yarn run compile'
      sh 'yarn run webpack'
    }

    stage('package') {
      // We always replace MAJOR.MINOR.PATCH from package.json with MAJOR.MINOR.BUILD
      sh "npx vsce package ${ publishPreRelease ? '--pre-release' : '' } --no-dependencies --no-git-tag-version --no-update-package-json ${ version }"
    }

    if (upload_location) {
    stage('snapshot') {
          def filesToPush = findFiles(glob: vsix_glob)
          sh "sftp -o StrictHostKeyChecking=no -C ${upload_location}/snapshots/vscode-ansible/ <<< \$'put -p -r ${filesToPush[0].path}'"
          stash name:stash_name, includes:filesToPush[0].path
    }
    }
}

node(node_name) {
  if (publishToMarketPlace) {
    timeout(time:5, unit:'DAYS') {
      // these are LDAP accounts
      input message:'Approve deployment?', submitter: 'ssbarnea,gnalawad,prsahoo,bthornto'
    }

    installBuildRequirements()
    unstash stash_name
    def vsix = findFiles(glob: vsix_glob)

    stage('publish') {
        // VS Code Marketplace
        withCredentials([[$class: 'StringBinding', credentialsId: 'vscode_java_marketplace', variable: 'TOKEN']]) {
          sh "npx vsce publish -p $TOKEN ${publishPreRelease ? '--pre-release' : ''} --packagePath ${vsix[0].path}"
        }
        archive includes:vsix_glob

        // Open-vsx Marketplace
        withCredentials([[$class: 'StringBinding', credentialsId: 'open-vsx-access-token', variable: 'OVSX_TOKEN']]) {
          sh "npx ovsx publish -p $OVSX_TOKEN ${vsix[0].path}"
        }
    }

    stage('promote to stable') {
        sh "sftp -o StrictHostKeyChecking=no -C ${upload_location}/stable/vscode-ansible/ <<< \$'put -p -r ${vsix[0].path}'"
    }
  }
}
