# Seek Power Platform Custom Connector

Adds `Search Jobs` and `Get Job Details` actions to Power Automate and Power Apps, pulling live data from Seek.com.au.

---

## Architecture

```
Power Apps / Power Automate
        ↓ Custom Connector (HTTPS + API key)
seek-connector API  (Azure Container Apps)
        ↓ Playwright headless Chrome
   seek.com.au
```

---

## Deploy the API (Azure Container Apps)

### Prerequisites
- Azure CLI installed and logged in (`az login`)
- Docker installed locally

### 1. Build and push the Docker image

```bash
# Create a container registry
az acr create --name seekconnectoracr --resource-group YOUR_RG --sku Basic

# Build and push
az acr build --registry seekconnectoracr --image seek-connector:latest .
```

### 2. Create the Container App

```bash
# Create Container Apps environment
az containerapp env create \
  --name seek-connector-env \
  --resource-group YOUR_RG \
  --location australiaeast

# Deploy the container
az containerapp create \
  --name seek-connector \
  --resource-group YOUR_RG \
  --environment seek-connector-env \
  --image seekconnectoracr.azurecr.io/seek-connector:latest \
  --target-port 3000 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 3 \
  --secrets api-key=YOUR_STRONG_API_KEY_HERE \
  --env-vars API_KEY=secretref:api-key

# Get your public URL
az containerapp show \
  --name seek-connector \
  --resource-group YOUR_RG \
  --query properties.configuration.ingress.fqdn -o tsv
```

The output FQDN (e.g. `seek-connector.happyfield-abc123.australiaeast.azurecontainerapps.io`) is your connector host.

### 3. Test it

```bash
HOST=https://seek-connector.happyfield-abc123.australiaeast.azurecontainerapps.io
KEY=YOUR_API_KEY

curl "$HOST/health"
curl "$HOST/jobs/search?q=Customer+Success+Manager&location=All-Melbourne-VIC" \
  -H "x-api-key: $KEY"
```

---

## Import into Power Platform

### Option A — Power Platform portal (easiest)

1. Go to [make.powerapps.com](https://make.powerapps.com) → **Data → Custom Connectors → New custom connector → Import an OpenAPI file**
2. Upload `connector/swagger.json`
3. On the **General** tab, update **Host** to your Container App FQDN
4. On the **Security** tab, confirm API key auth (`x-api-key` header)
5. Click **Create connector**
6. Go to **Test** tab → **New connection** → enter your API key → test both operations

### Option B — Power Platform CLI (`paconn`)

```bash
pip install paconn

paconn login
paconn create \
  --api-def connector/swagger.json \
  --api-prop connector/apiProperties.json
```

---

## Use in Power Automate

Once imported, the connector appears in the **Custom** tab when adding an action.

**Example flow — daily job digest email:**

```
Recurrence (daily 8am)
  → Seek: Search Jobs
      q: "Customer Success Manager"
      location: "All-Melbourne-VIC"
      dateRange: 1
  → Apply to each (jobs array)
      → Seek: Get Job Details (jobId from previous step)
      → Condition: salary contains "110" OR salary is null
          Yes → Send email (title, company, salary, applyUrl)
```

**Example flow — score and save to SharePoint:**

```
Seek: Search Jobs → loop → Seek: Get Job Details
  → HTTP POST to your scoring API (or Claude API)
  → SharePoint: Create item (title, company, score, url)
```

---

## Use in Power Apps

Add the connector as a data source, then call it from a button:

```
// In a button's OnSelect:
ClearCollect(
  JobResults,
  SeekJobSearch.SearchJobs({
    q: TextInput_Query.Text,
    location: "All-Melbourne-VIC",
    dateRange: 7
  }).jobs
);
```

Bind `JobResults` to a gallery to display the listings.

---

## Local development

```bash
cd seek-connector
npm install
npx playwright install chromium
API_KEY=testkey node api/server.js

# In another terminal:
curl "http://localhost:3000/jobs/search?q=Implementation+Consultant&location=All-Melbourne-VIC" \
  -H "x-api-key: testkey"
```
