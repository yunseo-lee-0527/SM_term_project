const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function patchFile(relativePath, replacements) {
  const filePath = path.join(root, relativePath);

  if (!fs.existsSync(filePath)) {
    console.warn(`[patch-expo-ngrok] skipped missing file: ${relativePath}`);
    return;
  }

  let content = fs.readFileSync(filePath, "utf8");
  let changed = false;

  for (const { before, after } of replacements) {
    if (content.includes(after)) {
      continue;
    }

    if (!content.includes(before)) {
      console.warn(`[patch-expo-ngrok] expected code not found in ${relativePath}`);
      continue;
    }

    content = content.replace(before, after);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, content);
    console.log(`[patch-expo-ngrok] patched ${relativePath}`);
  }
}

const missingResponseMessage = `error && error.message ? error.message : String(error)`;

patchFile("node_modules/@expo/ngrok/src/client.js", [
  {
    before: `    } catch (error) {
      let clientError;
      try {
        const response = JSON.parse(error.response.body);
        clientError = new NgrokClientError(
          response.msg,
          error.response,
          response
        );
      } catch (e) {
        clientError = new NgrokClientError(
          error.response.body,
          error.response,
          error.response.body
        );
      }
      throw clientError;
    }`,
    after: `    } catch (error) {
      const responseBody = error && error.response && error.response.body;

      if (!responseBody) {
        throw new NgrokClientError(
          ${missingResponseMessage},
          error && error.response,
          { msg: ${missingResponseMessage} }
        );
      }

      let clientError;
      try {
        const response = JSON.parse(responseBody);
        clientError = new NgrokClientError(
          response.msg,
          error.response,
          response
        );
      } catch (e) {
        clientError = new NgrokClientError(
          responseBody,
          error.response,
          responseBody
        );
      }
      throw clientError;
    }`,
  },
  {
    before: `    } catch (error) {
      const response = JSON.parse(error.response.body);
      throw new NgrokClientError(response.msg, error.response, response);
    }`,
    after: `    } catch (error) {
      const responseBody = error && error.response && error.response.body;

      if (!responseBody) {
        throw new NgrokClientError(
          ${missingResponseMessage},
          error && error.response,
          { msg: ${missingResponseMessage} }
        );
      }

      let response;
      try {
        response = JSON.parse(responseBody);
      } catch (e) {
        response = { msg: responseBody };
      }
      throw new NgrokClientError(response.msg, error.response, response);
    }`,
  },
]);

patchFile("node_modules/@expo/ngrok/src/utils.js", [
  {
    before: `  const body = err.body;
  const notReady500 = statusCode === 500 && /panic/.test(body);
  const notReady502 =
    statusCode === 502 &&
    body.details &&
    body.details.err === "tunnel session not ready yet";
  const notReady503 =
    statusCode === 503 &&
    body.details &&
    body.details.err ===
      "a successful ngrok tunnel session has not yet been established";`,
    after: `  const body = err.body || {};
  const bodyText = typeof body === "string" ? body : JSON.stringify(body);
  const details = body && typeof body === "object" ? body.details : undefined;
  const notReady500 = statusCode === 500 && /panic/.test(bodyText);
  const notReady502 =
    statusCode === 502 &&
    details &&
    details.err === "tunnel session not ready yet";
  const notReady503 =
    statusCode === 503 &&
    details &&
    details.err ===
      "a successful ngrok tunnel session has not yet been established";`,
  },
]);
