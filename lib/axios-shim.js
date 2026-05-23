module.exports = {
    post: async (url, data, config = {}) => {
        let headers = config.headers || {};
        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: typeof data === 'string' ? data : JSON.stringify(data)
        });
        const resData = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(res.statusText);
            err.response = { data: resData, status: res.status };
            throw err;
        }
        return { data: resData, status: res.status };
    },
    get: async (url, config = {}) => {
        let headers = config.headers || {};
        const res = await fetch(url, {
            method: 'GET',
            headers
        });
        const resData = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(res.statusText);
            err.response = { data: resData, status: res.status };
            throw err;
        }
        return { data: resData, status: res.status };
    }
};