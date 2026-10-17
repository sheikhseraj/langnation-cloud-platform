const express = require("express");
const { CognitoJwtVerifier } = require("aws-jwt-verify");

const app = express();

const PORT = process.env.PORT || 3000;

const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID;

let verifier = null;

if (COGNITO_USER_POOL_ID && COGNITO_CLIENT_ID) {
  verifier = CognitoJwtVerifier.create({
    userPoolId: COGNITO_USER_POOL_ID,
    tokenUse: "access",
    clientId: COGNITO_CLIENT_ID
  });
}

app.get("/", (req, res) => {
  res.json({
    application: "LangNation Cloud Platform",
    environment: process.env.NODE_ENV || "development",
    status: "running",
    message: "LangNation Cloud Platform API is running successfully."
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy"
  });
});

async function requireAuthentication(req, res, next) {
  if (!verifier) {
    return res.status(503).json({
      error: "Authentication service is not configured."
    });
  }

  const authorizationHeader = req.headers.authorization;

  if (!authorizationHeader) {
    return res.status(401).json({
      error: "Authorization token is required."
    });
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      error: "Authorization header must use Bearer authentication."
    });
  }

  try {
    const payload = await verifier.verify(token);

    req.user = payload;

    next();
  } catch (error) {
    console.error("JWT verification failed:", error.message);

    return res.status(401).json({
      error: "Invalid or expired access token."
    });
  }
}

app.get("/protected", requireAuthentication, (req, res) => {
  res.status(200).json({
    message: "Authentication successful.",
    authenticated: true,
    user: {
      sub: req.user.sub,
      username: req.user.username,
      tokenUse: req.user.token_use
    }
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`LangNation application running on port ${PORT}`);
});