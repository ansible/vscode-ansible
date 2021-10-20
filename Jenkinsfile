#!/usr/bin/env groovy

def installBuildRequirements(){
  def nodeHome = tool 'nodejs-16.12.0'
  env.PATH="${env.PATH}:${nodeHome}/bin"

  sh "npm install --global vsce@latest npm@latest"
}

def buildVscodeExtension(){
  sh "npm install"
  sh "npm run vscode:prepublish"
}

node("rhel8"){

  stage 'Checkout code'
  deleteDir()
  git branch: 'main', url: 'https://github.com/ansible/vscode-ansible.git'

  stage 'install build requirements'
  installBuildRequirements()

  stage 'build'
  sh "npm install"
  sh "npm run compile"

// add stage with testing here
//   stage 'Test for staging'
//   wrap([$class: 'Xvnc']) {
//     sh "npm test --silent"
//   }

  stage "package"
  def packageJson = readJSON file: 'package.json'
  sh "vsce package -o vscode-ansible-${packageJson.version}-${env.BUILD_NUMBER}.vsix"

  stage 'upload to staging'
  def vsix = findFiles(glob: '**.vsix')
  sh "rsync -Pzrlt --rsh=ssh --protocol=28 ${vsix[0].path} ${UPLOAD_LOCATION}/snapshots/vscode-ansible/"
  stash name:'vsix', includes:vsix[0].path
}

node("rhel8"){
  if(publishToMarketPlace.equals('true')){
    timeout(time:5, unit:'DAYS') {
      // these are LDAP accounts
      input message:'Approve deployment?', submitter: 'ssbarnea,ssydoren,gnalawad'
    }

    stage "Publish to Marketplaces"
    unstash 'vsix';
    def vsix = findFiles(glob: '**.vsix')
    // VS Code Marketplace
    withCredentials([[$class: 'StringBinding', credentialsId: 'vscode_java_marketplace', variable: 'TOKEN']]) {
      sh 'vsce publish -p ${TOKEN} --packagePath' + " ${vsix[0].path}"
    }

    // Open-vsx Marketplace
    sh "npm install -g ovsx"
    withCredentials([[$class: 'StringBinding', credentialsId: 'open-vsx-access-token', variable: 'OVSX_TOKEN']]) {
      sh 'ovsx publish -p ${OVSX_TOKEN}' + " ${vsix[0].path}"
    }
    archive includes:"**.vsix"

    stage ("Promote the build to stable") {
    sh "rsync -Pzrlt --rsh=ssh --protocol=28 *.vsix* ${UPLOAD_LOCATION}/stable/vscode-ansible/"
    }
  }
}
