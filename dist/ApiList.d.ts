declare const apiFunctionDict: {
    createSwap: any;
    inputSchema: any;
}, status: {
    type: "GET";
    callback: (requestBody: any, queryParams: any) => Promise<any>;
    inputSchema: {
        id: "string";
    };
};
