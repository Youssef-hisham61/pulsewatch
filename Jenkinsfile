pipeline {
    agent any
   // parameters {
       // choice(
          //  name:'VERSION_TYPE'
          //  choices: ['major',"minor", "patch"]
          //  description:"choose your patching method"
       // )
   // }
        options {
         timestamps()
            timeout(time: 30, unit: 'MINUTES')
            disableConcurrentBuilds()
             buildDiscarder(logRotator(numToKeepStr: '10', artifactNumToKeepStr: '5'))
    }
    environment {
        DOCKER_REPO = 'yh61/pulsewatch-images-docker-repo'  
    }
    stages {
        stage('increment build version'){
         when {
                branch 'develop'
         }
         steps{
            script {
                def version = sh (
                   script: "cd api && node -e \"console.log(require('./package.json').version)\"",
                   returnStdout: true
                ).trim()
                def parts = version.tokenize('.')
                def patch = parts[2].toInteger() + 1
                env.IMAGE_TAG = "${parts[0]}.${parts[1]}.${patch}"
                echo "Next version will be: ${IMAGE_TAG}"       
            }        
        }
         }
        stage('read version') {
            when {
                branch 'main'
            }
            steps {
                script {
                     def version = sh(
                script: "cd api && node -e \"console.log(require('./package.json').version)\"",
                returnStdout: true
            ).trim()
            env.IMAGE_TAG = version
            echo "Deploying version: ${IMAGE_TAG}"
        }
    }
}
        stage('Install dependencies') {
            steps { 
               sh 'cd api && npm install'
                sh 'cd worker && npm install'
            }
        }
        stage('syntax check') {
            steps {
               echo "Checking syntax of API and Worker code, and Nginx configuration"
               sh 'node --check api/index.js'
                sh 'node --check worker/index.js'
                }
            }
        stage('Tests') {
            steps {
                echo "Running tests..."
                sh 'cd api && npm install && npm test'
            }
        }
        stage ('build images'){
            steps {
                echo "Building Docker images..."
                sh "docker build -t ${DOCKER_REPO}:api-${IMAGE_TAG} ./api"
                sh "docker build -t ${DOCKER_REPO}:worker-${IMAGE_TAG} ./worker"
                sh "docker build -t ${DOCKER_REPO}:nginx-${IMAGE_TAG} ./nginx"
                sh "docker build -t ${DOCKER_REPO}:postgres-${IMAGE_TAG} ./db"
            }

        }
        stage('push images to repo') {
            steps {
                echo "pushing docker images to dockerhub repo"
                 withCredentials([usernamePassword(credentialsId: 'docker-repo-cred', usernameVariable: 'DOCKER_USERNAME', passwordVariable: 'DOCKER_PASSWORD')]) {
             sh 'echo $DOCKER_PASSWORD | docker login -u $DOCKER_USERNAME --password-stdin'
                sh "docker push ${DOCKER_REPO}:api-${IMAGE_TAG}"
                sh "docker push ${DOCKER_REPO}:worker-${IMAGE_TAG}"
                sh "docker push ${DOCKER_REPO}:nginx-${IMAGE_TAG}"
              sh "docker push ${DOCKER_REPO}:postgres-${IMAGE_TAG}"
              }  
            }
        
        }
   stage('commiting the version to git repo') {
           when {
                     branch 'develop'
            }
            steps{
                withCredentials([
                    usernamePassword(
                        credentialsId:"jenkins-github-cred",
                        usernameVariable:"GITHUB_USERNAME",
                        passwordVariable:"GITHUB_TOKEN"
                    )   
                ]) {
                sh "git checkout develop"
                sh 'git config pull.rebase true'
                sh 'git pull origin develop'
                sh 'cd api && npm version patch --no-git-tag-version'
                sh 'git config user.email "jenkins@pulsewatch.ci"'
                sh 'git config user.name "pulsewatch-jenkins-bot"'
                sh "git add api/package.json api/package-lock.json "
                sh "git commit -m \"ci: bump version to ${IMAGE_TAG}\""
                sh 'git push https://$GITHUB_USERNAME:$GITHUB_TOKEN@github.com/Youssef-hisham61/pulsewatch.git HEAD:develop'          
                script {
                    def commitSha = sh(
                        script: "git rev-parse --short HEAD",
                        returnStdout: true
                    ).trim()
                    echo "Committed version ${IMAGE_TAG} commited to develop | SHA: ${commitSha}"
                }
            }
        }}
        stage('deploy'){
           when {
                branch 'main'
            }
            steps {
                    echo "Deploy stage will be implemented with Kubernetes in Phase 3"
                            
            }
        }   } 

    post {
    always {
        echo "Cleaning up workspace and logging out of Docker registry"
        sh 'docker image prune -f'
        sh 'docker logout'
        cleanWs()
    }
    success {   
        echo "Pipeline completed successfully! Version: ${IMAGE_TAG}"
    }
    failure {
        echo "Pipeline failed. Please check the logs for details."
    }
}
        }    