const AWS = require('aws-sdk');

// Fix api version to https://aws.amazon.com/releasenotes/AWS-CloudFormation/2815554290482018 for max stability

AWS.config.region = 'eu-central-1';
AWS.config.apiVersions = {
  cloudformation: '2014-12-24',
  // other service API versions
};

const cloudformation = new AWS.CloudFormation();

var waitForCloudFormationStack = function (stackName, successCallback, iteration) {
  const interval = 10000;
  const retries = 60;

  iteration = typeof iteration !== 'undefined' ? iteration : 0;

  const failedStates = [
    'CREATE_FAILED',
    'DELETE_FAILED',
    'ROLLBACK_FAILED',
    'UPDATE_ROLLBACK_COMPLETE',
    'ROLLBACK_COMPLETE',
    'DELETE_COMPLETE',
    'UPDATE_ROLLBACK_FAILED'
  ];

  const successStates = [
    'CREATE_COMPLETE',
    'UPDATE_COMPLETE'
  ];

  const describeStacksCallback = function (err, data) {
    if (err) {
      if (/stack.*does not exist/i.test(err)) {
        console.log("waitForCloudFormationStack: non existing retry, iteration=" + iteration);

        setTimeout(function () {
          waitForCloudFormationStack(stackName, successCallback, ++iteration)
        }, interval);

      } else {
        console.log("waitForCloudFormationStack: " + err, err.stack); // an error occurred
      }
    } else {
      const stackStatus = data == null ? 'nonexisting' : data.Stacks[0].StackStatus;

      console.log("waitForCloudFormationStack: stack=" + stackName + " status=" + stackStatus);

      if (successStates.indexOf(stackStatus) > -1) {
        console.log("waitForCloudFormationStack: Wait completed.");

        // Format outputs for easier use
        const outputs = {}
        for (var stackIndex = 0; stackIndex < data.Stacks.length; stackIndex++) {
          var stack = data.Stacks[stackIndex];
          if (stack.StackName == stackName) {
            for (var outputIndex = 0; outputIndex < stack.Outputs.length; outputIndex++) {
              var output = stack.Outputs[outputIndex];
              outputs[output.OutputKey] = output.OutputValue
            }
          }
        }

        successCallback(data, outputs);
      } else if (failedStates.indexOf(stackStatus) > -1) {
        console.log("waitForCloudFormationStack: stack " + stackName + " in failed state " + stackStatus + ", no point to retry");
      } else {
        // Still pending, try until max retries
        if (iteration >= retries) {
          // If max retries -> timeout
          console.log("waitForCloudFormationStack: Timed out waiting for CloudFormation stack operation to complete.");
        } else {
          console.log("waitForCloudFormationStack: polling, iteration=" + iteration + " interval=" + interval);

          setTimeout(function () {
            waitForCloudFormationStack(stackName, successCallback, ++iteration)
          }, interval);

        }
      }
    }
  };

  cloudformation.describeStacks({
    StackName: stackName
  }, describeStacksCallback)
};

const updateCloudFormationStack = function (successCallback, stackParamsCallback) {
  const stackName = stackParamsCallback(true).StackName

  console.log("Updating CloudFormation stack " + stackName);

  const updateStackResponseHandler = function (err, data) {
    if (err) {
      if (/No updates are to be performed/i.test(err)) {
        console.log("No updates to be performed ");
        waitForCloudFormationStack(stackName, successCallback)

      } else if (/stack.*does not exist/i.test(err)) {
        console.log("Detected that stack does not exist. Doing createStack.");

        const createStackResponseHandler = function (err, data) {
          if (err) {
            console.log("Error: " + err);
            console.log("Error stacktrace:\n" + err.stack);
          } else {
            console.log("Stack creation started.");
            waitForCloudFormationStack(stackName, successCallback)
          }
        };

        cloudformation.createStack(stackParamsCallback(true), createStackResponseHandler);

      } else {
        console.log("Error: " + err);
        console.log("Error stacktrace:\n" + err.stack);
      }
    } else {
      console.log("Stack update started.");
      console.log(data);

      waitForCloudFormationStack(stackName, successCallback)
    }
  };

  cloudformation.updateStack(stackParamsCallback(false), updateStackResponseHandler);
};

const findEcsCluster = function(successCallback, clusterStackName, errorCallback) {
	cloudformation.describeStacks({
	  StackName: clusterStackName
	}, function(err, data) {
	  if (err) {
	    console.log(err, err.stack); // an error occurred
	    if (errorCallback) errorCallback();
	  } else {
		  if (data.Stacks.length != 1) {
			  console.log("Too many or zero stacks found for name " + clusterStackName + " (" + data.Stacks.length + " found)")
			  if (errorCallback) errorCallback();
			  return;
		  }

      // Format outputs for easier use
      const outputs = {}
      var stack = data.Stacks[0];
      for (var outputIndex = 0; outputIndex < stack.Outputs.length; outputIndex++) {
        var output = stack.Outputs[outputIndex];
        outputs[output.OutputKey] = output.OutputValue
      }
		  successCallback(outputs);
	  }
	});
}

module.exports.waitForCloudFormationStack = waitForCloudFormationStack;
module.exports.updateCloudFormationStack = updateCloudFormationStack;
module.exports.findEcsCluster = findEcsCluster;
