import admin from "firebase-admin";
import { Message } from "firebase-admin/messaging";
import { NextRequest, NextResponse } from "next/server";

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  const serviceAccount = require("./service_key.json");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export async function POST(request: NextRequest) {
  const { token, title, message, link } = await request.json();
  const redirectPath =
    typeof link === "string" && link.startsWith("/") && !link.startsWith("//")
      ? link
      : undefined;
  const wrapperLink = redirectPath
    ? `https://ubdev2026.github.io/?q=${encodeURIComponent(redirectPath)}`
    : undefined;

  const payload: Message = {
    token,
    notification: {
      title: title,
      body: message,
    },
    data: redirectPath ? { q: redirectPath } : undefined,
    webpush: wrapperLink
      ? {
          fcmOptions: {
            link: wrapperLink,
          },
        }
      : undefined,
  };

  try {
    await admin.messaging().send(payload);

    return NextResponse.json({ success: true, message: "Notification sent!" });
  } catch (error) {
    return NextResponse.json({ success: false, error });
  }
}
