
// Example structure of the API dict, convert this to class with swapper instance & functions to init the SDK, run sync with _syncSwaps()
const apiFunctionDict = {
  createSwap: {
    type: "POST",
    callback: (requestBody: any, queryParams: any) => {
      ...
    },
    inputSchema: {
      inputToken: {
        type: "string",
        description: "Input token ticker or address"
      },
      outputToken: "string",
      amount: "string",
      ...
    }
  },
  status: {
    type: "GET",
    callback: (requestBody: any, queryParams: any) => Promise<any>,
    inputSchema: {
      id: "string"
    }
  }
}

// Example boilerplate
for(let key in apiFunctionDict) {
  app.post("/"+key, (req, res) => apiFunctionDict[key].callback(req.body, req.query).then(response => res.json(response)));
}
