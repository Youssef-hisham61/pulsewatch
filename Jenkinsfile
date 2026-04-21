pipeline {
    agent any
   // parameters {
       // choice(
          //  name:'VERSION_TYPE'
          //  choices: ['major',"minor", "patch"]
          //  description:"choose your patching method"
       // )
   // }
    environment {
        DOCKER_REPO = 'yh61/pulsewatch-images-docker-repo'  
    }
    stages {
        stage('increment build version'){
         steps{
            echo "incrementing build version"    
            sh   "cd api && npm version patch --no-git-tag-version" 
            script {
                def version = sh (
                   script: "cd api && node -e \"console.log(require('./package.json').version)\"",
                   returnStdout: true
                ).trim()
                env.IMAGE_TAG = version              
            }        
        
        }
         }
        stage('Install dependencies') {
            agent {
                docker {
                    image 'node:18-alpine'
                }
            }
            steps { 
               sh 'cd api && npm install'
                sh 'cd worker && npm install'
            }
        }
        stage('syntax check') {
            agent {
                docker {
                    image 'node:18-alpine'
                }
            }
            steps {
               echo "Checking syntax of API and Worker code, and Nginx configuration"
               sh 'node --check api/index.js'
                sh 'node --check worker/index.js'
                }
            }
        stage('Tests') {
            agent {
                docker {
                    image 'node:18-alpine'
                }
            }
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
                anyOf {
                     branch 'main'
                     branch 'develop'
                }
            }
            steps{
                withCredentials([
                    usernamePassword(
                        credentialsId:"jenkins-github-cred",
                        usernameVariable:"GITHUB_USERNAME",
                        passwordVariable:"GITHUB_TOKEN"
                    )   
                ]) {
                sh "git checkout ${BRANCH_NAME}"
                sh 'git config user.email "jenkins@pulsewatch.ci"'
                sh 'git config user.name "pulsewatch-jenkins-bot"'
                sh "git add api/package.json api/package-lock.json "
                sh "git commit -m \"ci: bump version to ${IMAGE_TAG}\""
                sh 'git push https://$GITHUB_USERNAME:$GITHUB_TOKEN@github.com/Youssef-hisham61/pulsewatch.git HEAD:$BRANCH_NAME'          
            
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
        success {
            
            echo "Pipeline completed successfully!"
        }
        failure {
            echo "Pipeline failed. Please check the logs for details."
        }
    }
        }    