import { createServer, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { createInfraiClient, InfraiError } from "./infrai.js";
import { AppointmentLoginWorkflow, requestCodeBody, verifyCodeBody } from "./login_workflow.js";

const workflow = new AppointmentLoginWorkflow(createInfraiClient());

async function readJson(request: AsyncIterable<Buffer | string>): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  const requestId = request.headers["idempotency-key"] ?? randomUUID();
  try {
    if (request.method === "POST" && request.url === "/login/code") {
      return json(response, 202, await workflow.requestCode(requestCodeBody.parse(await readJson(request)), String(requestId)));
    }
    if (request.method === "POST" && request.url === "/login/verify") {
      return json(response, 200, await workflow.verifyAndCreateSession(verifyCodeBody.parse(await readJson(request)), String(requestId)));
    }
    return json(response, 404, { error: "route_not_found" });
  } catch (error) {
    if (error instanceof ZodError) return json(response, 400, { error: "invalid_request", issues: error.issues });
    if (error instanceof SyntaxError) return json(response, 400, { error: "invalid_json" });
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return json(response, status, { error: error.code, message: error.message });
    }
    console.error(error);
    return json(response, 500, { error: "internal_error" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Healthtech login service listening on http://localhost:${port}`));
