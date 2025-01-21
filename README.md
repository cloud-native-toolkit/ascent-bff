# Ascent BFF

This repository contains the Back-End micro-service of the Ascent tool (TechZone Deployer - Builder).

Ascent is a tool created by the IBM Ecosystem Lab to accelerate the adoption of IBM Software on Hybrid Cloud. Through automation and integration, Ascent enables enterprises to deliver compliant cloud architectures which can be clearly evidenced and communicated with Governance, Risk and Compliance teams.

This application backend will enable a collection of APIs that will support the relationship between a 
Reference Architecture and its Bill of Materials(BOM) (list of comprising services). The BOM relationship to 
the list of FS Ready services. The mapping between the cloud services and the FS Controls. Finally you can 
view the FS Controls mapping to the Cloud Services and the supporting reference Architectures.

Once we have this data model in place, we will be able to link it to the Automation Catalog that is being
built by Asset team,  we will be able to take the BOM and input it into the Solution Builder API they have built
and output a package of consistent terraform.

This will enable the Ecosystem teams including ISVs to have a consistent way of describing reference archtiectures
and having their automation packaged consistently.

This application is generated using [LoopBack 4 CLI](https://loopback.io/doc/en/lb4/Command-line-interface.html) with the
[initial project layout](https://loopback.io/doc/en/lb4/Loopback-application-layout.html).

## Supporting Documentation

List of reference documentation that will support the APIs

- [NIST-800-53](https://nvd.nist.gov/800-53)
- [Cloud Catalog API](https://globalcatalog.cloud.ibm.com/api/v1?_limit=100&complete=false&q=is.volume)
- [Automation Git Repo](https://github.com/ibm-garage-cloud/garage-terraform-modules/blob/main/MODULES.md)
- [Automation Catalog](https://raw.githubusercontent.com/ibm-garage-cloud/garage-terraform-modules/gh-pages/index.yaml)
- [Solution Builder Code]()

## Overview

The Architecture builder's goal is to simplify the complexity of the data attributes that surround a
reference architecture for the FS Cloud. When we review the Financial Controls the number of cloud services
and the possible reference architectures these can be assembled in. It has become clear
a tool will help manage this wide range of attributes.

The following diagram helps describes the key entities and their relationships.

![Data Model](./data/data-model.png)

The following diagram describes our database model in details:

![Database Model](./data/dbdocs/db-specs.png)

## Data

To help speed up the data loading a simple ingestion model has been created. The core
data entities are created in Excel spreadsheets. The first row of the entity holds
the column name or JSON attribute name. To ingest data save the entity in `csv` file 
format. into the `data/source` folder. To then convert the into JSON format
install the following package`

Install the `csvtojson` tool `npm install csvtojson -g`

Then run the script `./convert.sh` this will export the `csv` files into `json` files

### Import to MongoDB

From the `data` folder download the MongoDB certificate into `export DBCERT=~/projects/certs/cloud-mongodb.pem`

From the MongoDB services instance screen in IBM Cloud take the `composed` value and configure
the `URI` environment variable `export URI="mongodb://ibm_cloud_4..`.
For the test database you want to do the same thing with the `URI_TEST` environment variable `export URI_TEST="mongodb://ibm_cloud_4..`.

You can then run `./mload-cloud { $URI | $URI_TEST }` to configure the MongoDB collection with the initial data to 
feed the API.

## Local development

Setup the following environment variables before you can run the application.

To run this locally you need to take the mongo binding value that is registered as a 
secret in the OpenShift environment or from the Service Credentials section of a 
managed MongoDB instance. Take the binding value and configure it as a environment value.

A script has been provided to simplify this process. The steps to run the script are as follows:

1. Log into the IBM Cloud account using the ibmcloud cli, for example running:
    ```shell
    ❯ ibmcloud login --apikey <APIKEY>
    ```
2. Find the names of the MongoDB and Object Storage instances:
    ```shell
    ❯ ibmcloud resource service-instances
    ```
3. Source the setup-environment script to create the environment variables, passing the names of the services:
    ```shell
    ❯ export MONGO_NAME="MONGO_NAME" # e.g. builder-mongodb
    ❯ export COS_NAME="COS_NAME" # e.g. dev-mapper-storage
    ❯ export APPID_NAME="APPID_NAME" # e.g. dev-mapper
    ❯ export INSTANCE_ID="INSTANCE_ID"
    ❯ source ./scripts/setup-environment.sh $MONGO_NAME $COS_NAME $APPID_NAME
    ```
4. Verify the environment variables have been created by running the following:
    ```shell
    ❯ echo $DATABASE_DEV
    ❯ echo $STORAGE
    ❯ echo $APPID_OAUTH_SERVER_URL
    ```
5. Once these values are set it is now possible to run the application:
    ```shell
    ❯ yarn install
    ❯ yarn start:dev
    ```

## Run in Podman compose

**Note:** You need podman and podman-compose installed before running these instructions. On Mac, you can install both using Homebrew 
with the following command:

```shell
brew install podman podman-compose
```

**Note:** The backend is currently running a container image version from the image registry. If you would like to run from the current
version of the code, comment out the `image` line and uncomment the `build` line. Watching for changes to the code and dynamically
rebuilding the image is possible but requires some additional configuration in the `docker-compose.yaml` file.

### Start the containers

Start the compose project by running the following command from the root of this git repo folder:

```shell
podman compose -f docker-compose.yaml up
```

The BFF layer will be listening on localhost:3001 and the mongodb server will be listening on localhost:27017 if you want to connect
to the mongodb server directly. The credentials to access mongodb are in the `docker-compose.yaml` file.

### Stop the containers

When you are ready to stop the containers, run the following command:

```shell
podman compose down
```

## Deploy on OpenShift

### Set up

1. Install [Cloud-Native Toolkit](https://cloudnativetoolkit.dev/adopting/setup/installing.html).
2. Create projects on your cluster
    ```sh
    ❯ oc login ...
    ❯ oc new-project ascent-dev
    ❯ oc new-project ascent-test
    ❯ oc new-project ascent-staging
    ❯ oc project ascent-dev
    ```

### Set up Cloud Object Storage

3. Bind your IBM Cloud Object Storage service to your namespaces:
    ```sh
    ❯ icc <your-cluster> # Log in to cluster using "icc" or "oc login" command
    ❯ export CLUSTER_NAME="dev-mapper-ocp" # Name of your IBM Cloud MongoDB service
    ❯ export COS_SERVICE_NAME="dev-mapper-storage" # Name of your IBM Cloud MongoDB service
    ❯ ic oc cluster service bind --cluster $CLUSTER_NAME --service $COS_SERVICE_NAME -n ascent-dev # COS
    ❯ kubectl get secret binding-$COS_SERVICE_NAME -n ascent-dev -o yaml | sed "s/binding-${COS_SERVICE_NAME}/ascent-cos-config/g" | oc create -f - # Rename COS secret 
    ❯ oc get secret ascent-cos-config -n ascent-dev -o yaml | sed 's/ascent-dev/ascent-test/g' | oc create -f - # Copy COS secret to ascent-test namespace
    ❯ oc get secret ascent-cos-config -n ascent-dev -o yaml | sed 's/ascent-dev/ascent-staging/g' | oc create -f - # Copy COS secret to ascent-staging namespace
    ```

### Set up MongoDB database

Follow either of the steps below depending on the type of MongoDB service you are going to use.

#### IBM Cloud service: Databases for MongoDB

4. Bind your Databases for MongoDB services to your namespaces:
    ```sh
    ❯ icc <your-cluster> # Log in to cluster using "icc" or "oc login" command
    ❯ export CLUSTER_NAME="dev-mapper-ocp" # Name of your IBM Cloud MongoDB service
    ❯ export MONGO_SERVICE_NAME="builder-mongodb" # Name of your IBM Cloud MongoDB service
    ❯ ic oc cluster service bind --cluster $CLUSTER_NAME --service $MONGO_SERVICE_NAME -n ascent-dev # MongoDB
    ❯ oc get secret binding-$MONGO_SERVICE_NAME -n ascent-dev -o yaml | sed "s/binding-${MONGO_SERVICE_NAME}/ascent-mongo-config/g" | oc create -f - # Rename Mongo secret 
    ❯ oc get secret ascent-mongo-config -n ascent-dev -o yaml | sed 's/ascent-dev/ascent-test/g' | oc create -f - # Copy Mongo secret to ascent-test namespace
    ❯ oc get secret ascent-mongo-config -n ascent-dev -o yaml | sed 's/ascent-dev/ascent-staging/g' | oc create -f - # Copy Mongo secret to ascent-staging namespace
    ```

#### Self-Managed MongoDB

4. Provision a self-managed DB using Helm Chart (**Note:** Repeat for `ascent-dev`, `ascent-test` and `ascent-staging` namespaces):
   1. Get the chart values:
      ```sh
      ❯ helm show values stable/mongodb > mongo.values.yaml
      ```
   2. Update the following values in `mongo.values.yaml`:
      ```yaml
      ... ommited ...
      mongodbUsername: ascent-admin
      mongodbPassword: <YOUR_PASSWORD>
      mongodbDatabase: ascent-db
      ... ommited ...
      securityContext:
         enabled: false
      ... ommited ...
      ```
   3. Install the chart:
      ```sh
      ❯ helm install ascent-mongodb stable/mongodb --values mongo.values.yaml
      ```
   4. Create the `ascent-mongo-config` connection secret:
      ```sh
      ❯ export MONGODB_PASSWORD=<YOUR_PASSWORD>
      ❯ oc create secret generic ascent-mongo-config --from-literal=binding="{\"connection\":{\"mongodb\":{\"composed\":[\"mongodb://ascent-admin:${MONGODB_PASSWORD}@ascent-mongodb:27017/ascent-db\"],\"authentication\":{\"username\":\"ascent-admin\",\"password\":\"${MONGODB_PASSWORD}\"},\"database\":\"ascent-db\",\"hosts\":[{\"hostname\":\"localhost\",\"port\":27017}]}}}"
      ```

### Set Up Authentication

Follow either of the steps below depending on the authentication provider you want to use.

#### App ID

4. Bind your IBM Cloud services (MongoDB, AppId, and COS) to your namespaces:
    ```sh
    ❯ icc <your-cluster> # Log in to cluster using ICC
    ❯ export APPID_SERVICE_NAME="dev-mapper" # Name of your IBM Cloud App ID service
    ❯ ic oc cluster service bind --cluster $CLUSTER_NAME --service $APPID_SERVICE_NAME -n ascent-dev # AppID
    ❯ oc get secret binding-$APPID_SERVICE_NAME -n ascent-dev -o yaml | sed "s/binding-${APPID_SERVICE_NAME}/ascent-appid-config/g" | oc create -f - # Rename AppID secret 
    ```
5. Update the AppID secret to add a new `binding-application` key for UI to use and retrieve user roles.
   1. Copy the application credentials of your AppId service on IBM Cloud
      1. Go to your [resource list](https://cloud.ibm.com/resources).
      2. Select your AppId service.
      3. In the **Applications** section, copy your app credentials. **If none**:
         1. Create one with following scopes: `edit`, `super_edit`.
         2. Create Roles
            1. `admin` with scopes: `read`, `edit`, `super_edit`
         3. Assign Roles
   2. In the `ascent-dev` project, update the AppId secrets to add the new `binding-application` key with the value you just copied:
      1. In the **Workloads > Secrets** section, select the `ascent-appid-config` secret.
      2. On the top right, click **Edit Secret**.
      3. Scroll down to the bottom and add the new `binding-application` key.
      4. Copy the value you copied earlier, replace `oAuthServerUrl` with `oauthServerUrl`, then click **Save**.
      5. Copy the secret in the `ascent-test` and `ascent-staging` projects:
        ```sh
        ❯ oc get secret ascent-appid-config -n ascent-dev -o yaml | sed 's/ascent-dev/ascent-test/g' | oc create -f - # Copy AppID secret to ascent-test namespace
        ❯ oc get secret ascent-appid-config-n ascent-dev -o yaml | sed 's/ascent-dev/ascent-staging/g' | oc create -f - # Copy AppID secret to ascent-test namespace
        ```

#### OpenShift OAuth

4. Create OpenShift `OAuthClient` for Ascent:
   ```sh
   > cat <<EOF | kubectl apply -f -
   apiVersion: oauth.openshift.io/v1
   grantMethod: auto
   kind: OAuthClient
   metadata:
      name: ascent
      selfLink: /apis/oauth.openshift.io/v1/oauthclients/ascent
   redirectURIs:
   - http://localhost:3000/login/callback
   secret: <YOUR_CLIENT_SECRET>
   EOF
   ```
   **Note**: You'll have to add valid `redirectURIs` in the later steps.
5. Create the `ascent-oauth-config` secret with the config of the client you've just created:
   ```sh
    ❯ export OAUTH_CLIENT_SECRET="<YOUR_CLIENT_SECRET>"
    ❯ oc create secret generic ascent-oauth-config --from-literal=api-url=$(oc whoami --show-server) --from-literal=oauth-config="{\"clientID\": \"ascent\", \"clientSecret\": \"${OAUTH_CLIENT_SECRET}\", \"api_endpoint\": \"$(oc whoami --show-server)\"}" -n ascent-dev
    ❯ oc get secret ascent-oauth-config -n ascent-dev -o yaml | sed 's/ascent-dev/ascent-test/g' | oc create -f - # Copy OAuth secret to ascent-test namespace
    ❯ oc get secret ascent-oauth-config -n ascent-dev -o yaml | sed 's/ascent-dev/ascent-staging/g' | oc create -f - # Copy OAuth secret to ascent-staging namespace
   ```

#### Create Pipelines


5. Create a configmap in each project for the ui:
    ```sh
    ❯ oc create configmap ascent --from-literal=route=https://ascent-dev.openfn.co --from-literal=api-host=todo --from-literal=instance-id=$(date +%s | sha256sum | head -c 16 ; echo) -n ascent-dev
    ❯ oc create configmap ascent --from-literal=route=https://ascent-test.openfn.co --from-literal=api-host=todo --from-literal=instance-id=$(date +%s | sha256sum | head -c 16 ; echo) -n ascent-test
    ❯ oc create configmap ascent --from-literal=route=https://ascent.openfn.co --from-literal=api-host=todo --from-literal=instance-id=$(date +%s | sha256sum | head -c 16 ; echo) -n ascent-staging
    ```
    - **Note**: We'll update the `api-host` value once we've deployed the BFF APIs.
6. Create the pipeline for the BFF
   1. Update the `ascent-mongo-config` secret in `ascent-dev` namespace to add a new `binding-test` key with the same content as the `binding` key, in which you replace every `ibmclouddb` to your test database (mine is `ibmcloudtestdb`).
   2. In OpenShift console, update the `test` step of the `ibm-nodejs-test-v2-6-13` tekton task in `tools` project, to add the variables BFF needs to run testing:
      ```yaml
      ... omitted ...
          - env:
              - name: DATABASE_TEST
                valueFrom:
                  secretKeyRef:
                    key: binding-test
                    name: ascent-mongo-config
              - name: STORAGE
                valueFrom:
                  secretKeyRef:
                    key: binding
                    name: ascent-cos-config
            image: $(params.js-image)
            name: test
            resources: {}
            script: |
              CI=true npm test
            workingDir: $(params.source-dir)
      ... omitted ...
      ```
   3. Create the `docker-io` secret to pull `redis` image without encountering docker limit
    ```sh
    ❯ docker login
    ❯ kubectl create secret generic docker-io --from-file=.dockerconfigjson=$HOME/.docker/config.json --type=kubernetes.io/dockerconfigjson -n ascent-dev
    ```
   4. Create the BFF pipeline:
      ```sh
      ❯ oc sync ascent-dev --dev
      ❯ oc pipeline --tekton -u ${GIT_USERNAME} -P ${GIT_ACCESS_TOKEN} -g -n ascent-dev
      ❯ oc secret link pipeline docker-io --for=pull
      ```
   5. Once the pipeline is successful, create the UI pipeline:
      ```sh
      ❯ oc create configmap ascent \
        --from-literal=route=https://ascent-dev.openfn.co \
        --from-literal=api-host=https://$(oc get routes/architecture-builder-bff -n ascent-dev -o jsonpath='{.spec.host}') \
        --from-literal=instance-id=$(date +%s | sha256sum | head -c 16 ; echo)  -n ascent-dev
      ❯ cd path/to/architecture-builder-ui
      ❯ oc pipeline --tekton -n ascent-dev
      ```
   6. Set up ArgoCD:
      1. Create a new blank gitops repo, refered here as `https://github.ibm.com/gsi-labs/architecture-builder-gitops`)
      2. Set up gitops:
        ```sh
        ❯ git clone https://github.com/IBM/template-argocd-gitops architecture-builder-gitops
        ❯ cd architecture-builder-gitops
        ❯ git remote remove origin
        ❯ git remote add origin https://github.ibm.com/gsi-labs/architecture-builder-gitops
        ❯ git push -u origin main
        ❯ git checkout -b test
        ❯ cp -r templates/project-config-helm architecture-builder-bff
        ❯ cp -r templates/project-config-helm architecture-builder-ui
        ❯ git add .
        ❯ git commit -m "Added helm template"
        ❯ git push -u origin test
        ❯ igc namespace ascent-test
        ❯ oc policy add-role-to-group system:image-puller system:serviceaccounts:ascent-test -n ascent-dev
        ❯ git checkout -b staging
        ❯ git push -u origin staging
        ❯ igc namespace ascent-staging
        ❯ oc policy add-role-to-group system:image-puller system:serviceaccounts:ascent-staging -n ascent-dev
        ❯ oc project ascent-dev
        ❯ git checkout test
        ❯ igc gitops
        ```
      3. On ArgoCD:
         1. Connect gitops repository
         2. Create a new project `architecture-builder`:
            - With gitops repo as source repo
            - With 2 destinations `ascent-test` and `ascent-staging` in current cluster
         3. Create 4 applications under `architecture-builder` project:
            1. `test-architecture-builder-bff`:
               - Sync policy: Automatic
               - Source: gitops repo, `test` revision, `architecture-builder-bff` path
               - Destination: local cluster, `ascent-test` project
               - Click **Create** 
            2. `staging-architecture-builder-bff`:
               - Sync policy: Automatic
               - Source: gitops repo, `staging` revision, `architecture-builder-bff` path
               - Destination: local cluster, `ascent-staging` project
               - Click **Create** 
            3. `test-architecture-builder-ui`:
               - Sync policy: Automatic
               - Source: gitops repo, `test` revision, `architecture-builder-ui` path
               - Destination: local cluster, `ascent-test` project
               - Click **Create** 
            4. `staging-architecture-builder-ui`:
               - Sync policy: Automatic
               - Source: gitops repo, `staging` revision, `architecture-builder-ui` path
               - Destination: local cluster, `ascent-staging` project
               - Click **Create** 
      4. Run the BFF and UI pipelines.
   7. In AppId service dashboard (or in `ascent` OAuthClient if you're using OpenShift auth), add the `ui` route as valid callback uri. To get it you can copy the output from:
      ```sh
      ❯ echo "https://$(oc get route architecture-builder-ui -n ascent-test -o jsonpath='{.spec.host}')/login/callback"
      ```
   8. Update the `ascent` config map in `ascent-test` project:
      ```sh
      ❯ export API_HOST=https://$(oc get route architecture-builder-bff -n ascent-test -o jsonpath="{.spec.host}") \
        && export APP_URI=https://$(oc get route architecture-builder-ui -n ascent-test -o jsonpath="{.spec.host}") \
        && oc patch cm ascent -n ascent-test --type='json' -p="[{'op' : 'replace' ,'path' : '/data/api-host' ,'value' : $API_HOST}]" \
        && oc patch cm ascent -n ascent-test --type='json' -p="[{'op' : 'replace' ,'path' : '/data/route' ,'value' : $APP_URI}]"
      ```
   9. Once you've tested the app works on test env, submit a PR to `staging` branch of gitops repo from `test`.
   10. In AppId service dashboard (or in `ascent` OAuthClient if you're using OpenShift auth), add the `ui` route to appid valid callback uri. To get it you can copy the output from:
      ```sh
      ❯ echo "https://$(oc get route architecture-builder-ui -n ascent-staging -o jsonpath='{.spec.host}')/login/callback"
      ```
   11. Update the `ascent` config map in `ascent-staging` project:
      ```sh
      ❯ export API_HOST=https://$(oc get route architecture-builder-bff -n ascent-staging -o jsonpath="{.spec.host}") \
        && export APP_URI=https://$(oc get route architecture-builder-ui -n ascent-staging -o jsonpath="{.spec.host}") \
        && oc patch cm ascent -n ascent-staging --type='json' -p="[{'op' : 'replace' ,'path' : '/data/api-host' ,'value' : $API_HOST}]" \
        && oc patch cm ascent -n ascent-staging --type='json' -p="[{'op' : 'replace' ,'path' : '/data/route' ,'value' : $APP_URI}]"
      ```

There you go, you should have your delivery pipeline up and running!

**Known issues**:
- ArgoCD application controller might not be able to create resource in `ascent-test` and `ascent-staging` projects. If so the following should fix the issue:
  ```sh
  ❯ oc policy add-role-to-user edit system:serviceaccounts:tools:argocd-argocd-application-controller -n ascent-test
  ❯ oc policy add-role-to-user edit system:serviceaccounts:tools:argocd-argocd-application-controller -n ascent-staging
  ```
- Access to IBM Cloud image registry from `ascent-test` and `ascent-staging`:
  ```sh
  ❯ oc get secret all-icr-io -n default -o yaml | sed 's/default/ascent-test/g' | oc create -n ascent-test -f -
  ❯ oc get secret all-icr-io -n default -o yaml | sed 's/default/ascent-staging/g' | oc create -n ascent-staging -f -
  ❯ oc secret link default all-icr-io --for=pull -n ascent-test
  ❯ oc secret link default all-icr-io --for=pull -n ascent-staging
  ```

## Rebuild the project

To incrementally build the project:

```sh
yarn run build
```

To force a full build by cleaning up cached artifacts:

```sh
yarn run rebuild
```

## Fix code style and formatting issues

```sh
yarn run lint
```

To automatically fix such issues:

```sh
yarn run lint:fix
```

## Tests

```sh
export DATABASE_TEST="{connection....}"
yarn test
```

### redis (install on mac)

```sh
brew install redis
brew services start redis
redis-cli
SET "Key" "value"
GET Key
brew services stop redis
```

## What's next

Please check out [LoopBack 4 documentation](https://loopback.io/doc/en/lb4/) to
understand how you can continue to add features to this application.

[![LoopBack](https://github.com/strongloop/loopback-next/raw/master/docs/site/imgs/branding/Powered-by-LoopBack-Badge-(blue)-@2x.png)](http://loopback.io/)
