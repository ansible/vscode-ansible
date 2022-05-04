#!/usr/bin/env groovy

def installBuildRequirements() {
  def nodeHome = tool 'nodejs-latest'
  env.PATH = "${env.PATH}:${nodeHome}/bin"

  sh 'npm install --global vsce@latest npm@latest'
}

def buildVscodeExtension() {
  sh 'npm install'
  sh 'npm run vscode-prepublish'
}

node('rhel8') {
  stage 'Checkout code'
  deleteDir()
  git branch: 'main', url: 'https://github.com/ansible/vscode-ansible.git'

  stage 'install build requirements'
  installBuildRequirements()

  stage 'build'
  sh 'npm install'
  sh 'npm run webpack'

// add stage with testing here
//   stage 'Test for staging'
//   // cspell: disable-next-line
//   wrap([$class: 'Xvnc']) {
//     sh "npm test --silent"
//   }

  stage 'package'
  def packageJson = readJSON file: 'package.json'
  sh "vsce package -o vscode-ansible-${packageJson.version}-${env.BUILD_NUMBER}.vsix"

  if (params.UPLOAD_LOCATION) {
    stage('snapshot') {
        def filesToPush = findFiles(glob: '**.vsix')
        sh "sftp -C ${UPLOAD_LOCATION}/snapshots/vscode-ansible/ <<< \$'put -p -r ${filesToPush[0].path}'"
        stash name:'vsix', includes:filesToPush[0].path
    }
  }
}

node('rhel8') {
  if (publishToMarketPlace.equals('true')) {
    timeout(time:5, unit:'DAYS') {
      // these are LDAP accounts
      input message:'Approve deployment?', submitter: 'ssbarnea,ssydoren,gnalawad,prsahoo,bthornto'
    }

    installBuildRequirements()
    stage 'Publish to Marketplaces'
    unstash 'vsix'
    // VS Code Marketplace
    withCredentials([[$class: 'StringBinding', credentialsId: 'vscode_java_marketplace', variable: 'TOKEN']]) {
      def vsix = findFiles(glob: '**.vsix')
      sh 'vsce publish -p ${TOKEN} --packagePath' + " ${vsix[0].path}"
    }
    archive includes:'**.vsix'

    // Open-vsx Marketplace
    sh 'npm install -g ovsx'
    withCredentials([[$class: 'StringBinding', credentialsId: 'open-vsx-access-token', variable: 'OVSX_TOKEN']]) {
      sh 'ovsx publish -p ${OVSX_TOKEN}' + " ${vsix[0].path}"
    }

    stage ('Promote the build to stable') {
      // cspell: disable-next-line
      def vsix = findFiles(glob: '**.vsix')
      sh "sftp -C ${UPLOAD_LOCATION}/stable/vscode-ansible/ <<< \$'put -p -r ${vsix[0].path}'"
    }
  }
}
