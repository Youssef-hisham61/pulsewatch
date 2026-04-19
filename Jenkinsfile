pipeline {
    agent any
    environment {
        DOCKER_REPO = 'yh61/pulsewatch-images-docker-repo'
        IMAGE_TAG = 'latest'    
    }
    stages {
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
                 withCredentials([usernamePassword(credentialsId: 'dockerhub-repo-cred', usernameVariable: 'DOCKER_USERNAME', passwordVariable: 'DOCKER_PASSWORD')]) {
             sh "echo ${DOCKER_PASSWORD} | docker login -u ${DOCKER_USERNAME} --password-stdin"
                sh "docker push ${DOCKER_REPO}:api-${IMAGE_TAG}"
                sh "docker push ${DOCKER_REPO}:worker-${IMAGE_TAG}"
                sh "docker push ${DOCKER_REPO}:nginx-${IMAGE_TAG}"
              sh "docker push ${DOCKER_REPO}:postgres-${IMAGE_TAG}"
              }  
            }
        
        }
        stage('deploy'){
           when {
                branch 'main'
            }
            steps {
                    echo "Deploying to production environment..."
            }
        }    
    
    }

    post {
        success {
            
            echo "Pipeline completed successfully!"
        }
        failure {
            echo "Pipeline failed. Please check the logs for details."
        }
    }
    }