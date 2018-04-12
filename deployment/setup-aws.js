'use strict';
// http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudFormation.html
// How to setup AWS SDK credentials from js: https://aws.amazon.com/sdk-for-node-js/#Configure

const AWS = require('aws-sdk');
AWS.config.region = process.env.AWS_REGION ? process.env.AWS_REGION : 'eu-central-1';
const cfutil = require('./cloudformation-util.js')
const ecsutil = require('./ecs-util.js')
const path = require('path')
const fs = require('fs');
//const dynamodb = new AWS.DynamoDB();
const Promise = require("bluebird");

if (process.argv.length == 2) {
    console.log("\nUsage: node setup-aws.js <environment> <target application> <docker image tag to deploy>");
    console.log("Where:\n");
    console.log("  environment                 : e.g. dev or prod");
    console.log("  target application");
    console.log("  docker image tag to deploy  : docker image version to deploy");
    process.exit(-1);
}

const environmentName = process.argv[2];
const targetAppName = process.argv[3];
var imageTagToDeploy = process.argv[4];

if (imageTagToDeploy == "") {
    imageTagToDeploy = "latest";
}

// Tags
const tags = {
  "Service" : "MobileApp",
  "BusinessUnit" : "CES",
  "Owner" : "Finnair CES"
}

// List of all tables, for tagging
const tables = [
  'CustomerService_Member_preprod',
  'CustomerService_Member_prod',
  'CustomerService_User_preprod',
  'CustomerService_User_prod'
];

console.log("Environment: " + environmentName);
console.log("Target app: " + targetAppName);

const appInstances = {

    "CurrencyService" : {
        "stackName" : "currency-service-" + environmentName,
        "DNSServiceName" : "currency",
        "mainContainerName" : "CurrencyService",

        // Port where the app in docker image listens inside the container
        "containerPort" : 8000,
        "ContainerImageName" : "379698354871.dkr.ecr.us-west-2.amazonaws.com/ecr:currency",
        "LBProtocol" : "TCP",

        "dev" : {
            "ECSClusterStack" : "EC2ContainerService-testCluster",
            "serviceStackSuffix" : "",
            // Unique port number needed for each app. Exposed on docker hosts and bound to ELB.
            // The ELB and docker host instances are linked via this port. Multiple ports
            // are needed to support multiple apps.
            "hostPort" : 8000,
            // The app is exposed on the ELB on this port. Each app should get its own ELB below.
            "elbPort" : 80,
            "DNSServiceNameSuffix" : "-dev",
            "subnets" : "PrivateSubnets",
            "HCTarget" : "HTTP:10000/api/check",
            "application_environment" : "dev",
            "logstash_environment" : "Development",
            "minimumHealthyPercent": 50,
            "maximumPercent": 100
        },
        "preprod" : {
            "ECSClusterStack" : "EC2ContainerService-testCluster",
            "serviceStackSuffix" : "",
            // Unique port number needed for each app. Exposed on docker hosts and bound to ELB.
            // The ELB and docker host instances are linked via this port. Multiple ports
            // are needed to support multiple apps.
            "hostPort" : 10000,
            // The app is exposed on the ELB on this port. Each app should get its own ELB below.
            "elbPort" : 80,
            "DNSServiceNameSuffix" : "-preprod",
            "subnets" : "PrivateSubnets",
            "HCTarget" : "HTTP:10000/api/check",
            "application_environment" : "preprod",
            "logstash_environment" : "Preproduction",
            "minimumHealthyPercent": 50,
            "maximumPercent": 100
        },
        "prod" : {
            "ECSClusterStack" : "EC2ContainerService-testCluster",
            "serviceStackSuffix" : "-v2",
            // Unique port number needed for each app. Exposed on docker hosts and bound to ELB.
            // The ELB and docker host instances are linked via this port. Multiple ports
            // are needed to support multiple apps.
            "hostPort" : 10000,
            // The app is exposed on the ELB on this port. Each app should get its own ELB below.
            "elbPort" : 80,
            "DNSServiceNameSuffix" : "",
            "subnets" : "PrivateSubnets",
            "HCTarget" : "HTTP:10000/api/check",
            "application_environment" : "prod",
            "logstash_environment" : "Production",
            "minimumHealthyPercent": 100,
            "maximumPercent": 200
        }
    }
}

const apps = {

    "CustomerService" : function(successCallback, appParams, instanceParams) {
        cfutil.findEcsCluster(function(stackOutputs) {
            instanceParams.ECSCluster = stackOutputs.ECSClusterName;
            instanceParams.ElbSG = stackOutputs.ElbSecurityGroupName;

            appParams.stackName =  appParams.stackName + instanceParams.serviceStackSuffix;

            console.log("Stack name: " + appParams.stackName);

            const taskDefName = appParams.mainContainerName + "-" + environmentName;
            const DNSName = appParams.DNSServiceName + instanceParams.DNSServiceNameSuffix + ".ecom.finnair.com";

            // Task definitions are created outside CloudFormation, because they are the update mechanism for docker images
            // and they support revisions.
            const taskDefinitionParams =  {
                "family" : taskDefName,
                "containerDefinitions" : [
                    {
                        "name" : appParams.mainContainerName,
                        "image" : appParams.ContainerImageName + ":" + imageTagToDeploy,
                        "cpu" : 10,
                        "memoryReservation": 600,
                        "memory": 750,
                        "portMappings" : [
                            {
                                "containerPort" : appParams.containerPort,
                                "hostPort" : instanceParams.hostPort
                            }
                        ],
                        "environment" : [
                            {
                              "name": "application_environment",
                              "value": instanceParams.application_environment
                            }
                        ],
                        "dockerLabels" : {
                            "environment" : instanceParams.logstash_environment,
                            "type" : "MemberService",
                            "logstash" : "true"
                        },
                        "logConfiguration" : {
                            "logDriver" : "json-file",
                            "options" : {
                                "labels" : "logstash,environment,type"
                            }
                        }
                    }
                ]
            };

            // Create ELB and other resources in one appTemplateOutputs
            // Then the ECS Service API call at end ties all that together and does the actual deployment.
            const cloudFormationTemplate = {
                "AWSTemplateFormatVersion" : "2010-09-09",
                "Description" : "AWS CloudFormation template to deploy " + appParams.mainContainerName + " docker service to an existing ECS Cluster.",
                "Parameters" : {
                    "PublicSubnets" : {
                        "Description" : "The public subnets",
                        "Type" : "CommaDelimitedList",
                        "Default" : "subnet-924a4ec9,subnet-36733750"
                    },
                    "CrossZone" : {
                        "Description" : "Cross-Zone Load Balancing",
                        "Type" : "String",
                        "Default" : "true"
                    },
                    "HealthyTreshold" : {
                        "Description" : "Healthy Threshold for Health Check",
                        "Type" : "Number",
                        "Default" : "2"
                    },
                    "UnHealthyTreshold" : {
                        "Description" : "Unhealthy Threshold for Health Check",
                        "Type" : "Number",
                        "Default" : "5"
                    },
                    "HCInterval" : {
                        "Description" : "Health Check Interval",
                        "Type" : "Number",
                        "Default" : "60"
                    },
                    "HCTimeout" : {
                        "Description" : "Health Check Timeout",
                        "Type" : "Number",
                        "Default" : "59"
                    }
                },
                "Resources" : {
                	"ServiceRoute53" : {
                        "Type" : "AWS::Route53::RecordSet",
                        "Properties" : {
                            "HostedZoneId" : "Z1848FRGBKEJLB",
                            "Comment" : "DNS name for accessing the service",
                            "Name" : DNSName,
                            "Type" : "A",
                            "AliasTarget" : {
                                "DNSName" : {
                                    "Fn::GetAtt" : [
                                        "EcsElasticLoadBalancer",
                                        "DNSName"
                                    ]
                                },
                                "HostedZoneId" : {
                                    "Fn::GetAtt" : [
                                        "EcsElasticLoadBalancer",
                                        "CanonicalHostedZoneNameID"
                                    ]
                                }
                            }
                        }
                    },
                    "EcsElasticLoadBalancer" : {
                        "Type" : "AWS::ElasticLoadBalancing::LoadBalancer",
                        "Properties" : {
                            "Subnets" : {
                                "Ref" : instanceParams.subnets
                            },
                            "SecurityGroups" : [
                                instanceParams.ElbSG
                            ],
                            "CrossZone" : {
                                "Ref" : "CrossZone"
                            },
                            "Scheme" : "internal",
                            "Listeners" : [
                                {
                                    "LoadBalancerPort" : instanceParams.elbPort,
                                    "InstancePort" : instanceParams.hostPort,
                                    "Protocol" : appParams.LBProtocol
                                }
                            ],
                            "ConnectionSettings": {
                              "IdleTimeout" : 115
                            },
                            "HealthCheck" : {
                                "Target" : instanceParams.HCTarget,
                                "HealthyThreshold" : {
                                    "Ref" : "HealthyTreshold"
                                },
                                "UnhealthyThreshold" : {
                                    "Ref" : "UnHealthyTreshold"
                                },
                                "Interval" : {
                                    "Ref" : "HCInterval"
                                },
                                "Timeout" : {
                                    "Ref" : "HCTimeout"
                                }
                            }
                        }
                    },
                    "ECSServiceRole" : {
                        "Type" : "AWS::IAM::Role",
                        "Properties" : {
                            "AssumeRolePolicyDocument" : {
                                "Statement" : [
                                    {
                                        "Effect" : "Allow",
                                        "Principal" : {
                                            "Service" : [
                                                "ecs.amazonaws.com"
                                            ]
                                        },
                                        "Action" : [
                                            "sts:AssumeRole"
                                        ]
                                    }
                                ]
                            },
                            "Path" : "/",
                            "Policies" : [
                                {
                                    "PolicyName" : "ecs-service",
                                    "PolicyDocument" : {
                                        "Statement" : [
                                            {
                                                "Effect" : "Allow",
                                                "Action" : [
                                                    "elasticloadbalancing:Describe*",
                                                    "elasticloadbalancing:DeregisterInstancesFromLoadBalancer",
                                                    "elasticloadbalancing:RegisterInstancesWithLoadBalancer",
                                                    "ec2:Describe*",
                                                    "ec2:AuthorizeSecurityGroupIngress"
                                                ],
                                                "Resource" : "*"
                                            }
                                        ]
                                    }
                                }
                            ]
                          }
                        },
                        /* This is the AWS role which gives the docker image to use AWS resources.
                         * Use ContainerCredentialsProvider in Java to get this role for your code. */
                        "ECSTaskRole": {
                          "Type": "AWS::IAM::Role",
                          "Properties": {
                            "AssumeRolePolicyDocument": {
                              "Statement": [
                                {
                                  "Effect": "Allow",
                                  "Principal": {
                                    "Service": [
                                                "ecs-tasks.amazonaws.com"
                                    ]
                                  },
                                  "Action": [
                                             "sts:AssumeRole"
                                 ]
                                }
                              ]
                            },
                            "Path": "/"
                          }
                        }
                },
                "Outputs" : {
                    "EcsServiceRoleName" : {
                        "Description" : "Created ECSServiceRole",
                        "Value" : {
                            "Ref" : "ECSServiceRole"
                        }
                    },
                    "EcsTaskRoleArn" : {
                        "Description": "Created ECSTaskRole",
                        "Value" : { "Fn::GetAtt" : [ "ECSTaskRole", "Arn" ]},
                    },
                    "ServiceURL" : {
                        "Description" : "Created URL for the service",
                        "Value" : {
                            "Fn::Join" : [
                                "",
                                [
                                    "http://",
                                    {
                                        "Ref" : "ServiceRoute53"
                                    },
                                    "/"
                                ]
                            ]
                        },
                        "Description" : "Service URL"
                    },
                    "AppElbName" : {
                        "Description" : "Per app elb.",
                        "Value" : {
                            "Ref" : "EcsElasticLoadBalancer"
                        }
                    }
                }
            };

            if (cloudFormationTemplate.Resources.EcsElasticLoadBalancer) {
              cloudFormationTemplate.Resources.EcsElasticLoadBalancer.Properties.Tags = [
                {
                  "Key" : "Service",
                  "Value" : tags.Service
                }, {
                  "Key" : "BusinessUnit",
                  "Value" : tags.BusinessUnit
                }, {
                  "Key" : "Owner",
                  "Value" : tags.Owner
                }
               ]
            }

            const serviceParams = function(appTemplateOutputs, taskDefinition) {
                return {
                    "serviceName" : appParams.stackName,
                    "cluster" : instanceParams.ECSCluster,
                    "desiredCount" : 2,
                    "loadBalancers" : [
                        {
                            "containerName" : appParams.mainContainerName,
                            "containerPort" : appParams.containerPort,
                            "loadBalancerName" : appTemplateOutputs.AppElbName
                        }
                    ],
                    "taskDefinition" : taskDefinition,
                    "role" : appTemplateOutputs.EcsServiceRoleName,
                    "deploymentConfiguration" : {
                        "maximumPercent" : instanceParams.maximumPercent,
                        "minimumHealthyPercent" : instanceParams.minimumHealthyPercent
                    }
                };
            };

	        const updateApp = function(stackOutputs) {
	          if (stackOutputs) {
	            // stack already exists->update taskRoleArn
	            taskDefinitionParams.taskRoleArn = stackOutputs.EcsTaskRoleArn;
	          }
	          ecsutil.updateApp(successCallback, appParams.stackName, cloudFormationTemplate, taskDefinitionParams, serviceParams);
	        }

	        cfutil.findEcsCluster(updateApp, appParams.stackName, updateApp);

        }, instanceParams.ECSClusterStack);
    }

}

if (typeof targetAppName !== "undefined") {
    if (typeof apps[targetAppName] === "undefined") {
        console.log("Application " + targetAppName + " not defined in apps map in script.");
        process.exit(1);
    }
    console.log("Target application set to " + targetAppName + " from command line.");
} else {
    console.log("Give target application after environment on command line.");
}

const createApp = function () {
    if (typeof targetAppName !== 'undefined') {
        console.log("Create app " + targetAppName);

        const appCreatedCallback = function () {
            console.log(`All done.`)
        }

        apps[targetAppName](appCreatedCallback, appInstances[targetAppName], appInstances[targetAppName][environmentName]);
    } else {
        console.log("No target application name give on command line, so nothing further to do.")
    }
}

createApp();

//

// http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html#Credentials_from_the_Shared_Credentials_File_____aws_credentials_
// To use AWS profiles, in case multiple accounts in use:
// $ AWS_PROFILE=ccg-finnair node setup-aws.js dev
