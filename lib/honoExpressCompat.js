const { Hono } = require('hono');

function expressToHono() {
    const app = new Hono();

    app.honoExpressWrap = (handler) => {
        return async (c, next) => {
            const headers = {};
            for (let [key, value] of c.req.raw.headers.entries()) {
                headers[key.toLowerCase()] = value;
            }

            const req = {
                params: c.req.param(),
                query: c.req.query(),
                header: (name) => c.req.header(name),
                headers: headers,
                method: c.req.method,
                url: c.req.url,
                user: c.get('user')
            };

            const contentType = c.req.header('content-type') || '';
            if (['POST', 'PUT', 'PATCH'].includes(req.method) && contentType.includes('application/json')) {
                try { req.body = await c.req.json(); } catch(e) { req.body = {}; }
            } else if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
                try { req.body = await c.req.parseBody(); } catch(e) { req.body = {}; }
            } else {
                req.body = {};
            }

            let resolveResponse;
            const responsePromise = new Promise(resolve => { resolveResponse = resolve; });

            let statusCode = 200;
            const res = {
                status: (code) => { statusCode = code; return res; },
                json: (data) => { resolveResponse(c.json(data, statusCode)); return res; },
                send: (text) => { resolveResponse(c.text(text, statusCode)); return res; },
                end: () => { resolveResponse(c.body(null, statusCode)); return res; }
            };

            let nextCalled = false;
            let resolveNext;
            const nextPromise = new Promise(resolve => { resolveNext = resolve; });

            const nextWrapper = async () => {
                nextCalled = true;
                if (req.user) c.set('user', req.user);
                resolveNext();
            };

            try {
                handler(req, res, nextWrapper);
            } catch (err) {
                return c.json({ error: err.message }, 500);
            }

            return Promise.race([
                responsePromise,
                nextPromise.then(() => next())
            ]);
        };
    };

    const proxiedApp = new Proxy(app, {
        get(target, prop) {
            if (['get', 'post', 'put', 'patch', 'delete', 'use'].includes(prop)) {
                return (path, ...handlers) => {
                    const isPathString = typeof path === 'string';
                    const routePath = isPathString ? path : '*';
                    const routeHandlers = isPathString ? handlers : [path, ...handlers];
                    
                    const wrappedHandlers = routeHandlers.map(h => {
                        if (h && typeof h.fetch === 'function') {
                            // It's a Hono app (e.g. from app.route)
                            return h;
                        }
                        if (h && h.isHonoExpressCompat) {
                            return h.app;
                        }
                        return target.honoExpressWrap(h);
                    });

                    if (prop === 'use') {
                        return target.use(routePath, ...wrappedHandlers);
                    }
                    return target[prop](routePath, ...wrappedHandlers);
                };
            }
            return target[prop];
        }
    });

    proxiedApp.isHonoExpressCompat = true;
    proxiedApp.app = app;
    return proxiedApp;
}

module.exports = { expressToHono };