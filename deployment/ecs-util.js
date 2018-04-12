const AWS = require('aws-sdk');

const cfutil = require('./cloudformation-util.js')

// Fix api version to https://aws.amazon.com/releasenotes/AWS-CloudFormation/2815554290482018 for max stability

AWS.config.region = 'us-west-2';
AWS.config.apiVersions = {
  ecs: '2014-11-13'
  // other service API versions
};
const ecs = new AWS.ECS();

const registerApp = function (successCallback, stackName, template, taskDefinitionParams, serviceParamsFunc) {
  const stackParams = function (create) {
    return {
      StackName: stackName,
      Capabilities: ['CAPABILITY_IAM'],
      TemplateBody: JSON.stringify(template),
      Parameters: []
    };
  };

  const updateServiceCallback = function (err, data) {
    if (err) {
      console.log("Service Update Error: " + err);
      console.log("Error stacktrace:\n" + err.stack);
    } else {
      console.log("Service updated\n" + data.service);
      successCallback
    }
  };


  const registerTaskDefCallback = function (err, data) {
    if (err) {
      console.log("Error: " + err);
      console.log("Error stacktrace:\n" + err.stack);
    } else {
      const revision = data.taskDefinition.revision;
      const family = data.taskDefinition.family;

      console.log("Task definition " + family + " revision " + revision + " created.");

      const successCallbackWrapper = function (data, appStackOutputs) {
        console.log(appStackOutputs);

        const serviceParams = serviceParamsFunc(appStackOutputs, family + ":" + revision);

        const createServiceCallback = function (err, data) {
          if (err) {
            if (/Creation of service was not idempotent/i.test(err)) {
              console.log("Service already created, attempting to update");
              delete serviceParams["clientToken"];
              delete serviceParams["role"];
              delete serviceParams["loadBalancers"];
              delete serviceParams["deploymentConfiguration"];
              delete serviceParams["desiredCount"];
              serviceParams["service"] = serviceParams["serviceName"];
              delete serviceParams["serviceName"];
              ecs.updateService(serviceParams, updateServiceCallback);
            } else {
              console.log("Service Create Error: " + err);
              console.log("Error stacktrace:\n" + err.stack);
            }
          } else {
            console.log("Service created\n" + data.service);
            successCallback
          }
        };

        // Service can't be maintained with CloudFormation for now due to bugs.
        // The cloudformation operations touching services tend to hang randomly.
        // Because of this we have this hack that first tries createService and then updateService.
        // As a consequence some things in service can't be updated.
        ecs.createService(serviceParams, createServiceCallback);
      };

      cfutil.updateCloudFormationStack(successCallbackWrapper, stackParams);
    }
  };

  ecs.registerTaskDefinition(taskDefinitionParams, registerTaskDefCallback)
};

const createEcsCluster = function (successCallback, clusterName) {
  // Create cluster without CloudFormation to get sensible name
  ecs.createCluster({clusterName: clusterName}, function (err, data) {
    if (err) {
      console.log("Error: " + err);
      console.log("Error stacktrace:\n" + err.stack);
    } else {
      console.log(data);
      successCallback()
    }
  });
}

module.exports.updateApp = registerApp;
module.exports.createEcsCluster = createEcsCluster;
