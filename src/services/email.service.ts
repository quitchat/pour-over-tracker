import nodemailer from "nodemailer";

export type PasswordResetEmailResult = {
    sent: boolean;
    reason?: string;
};

function getSmtpPort(): number {
    const port = Number(process.env.SMTP_PORT || 587);

    if (Number.isNaN(port) || port <= 0) {
        return 587;
    }

    return port;
}

function isSmtpConfigured(): boolean {
    return !!process.env.SMTP_HOST && !!process.env.SMTP_FROM;
}

function createTransport() {
    const host = process.env.SMTP_HOST;
    const port = getSmtpPort();
    const secure = process.env.SMTP_SECURE === "true";
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;

    return nodemailer.createTransport({
        host: host,
        port: port,
        secure: secure,
        auth: user && pass ? {
            user: user,
            pass: pass
        } : undefined
    });
}

export async function sendPasswordResetEmail(toEmail: string, resetUrl: string): Promise<PasswordResetEmailResult> {
    if (!isSmtpConfigured()) {
        return {
            sent: false,
            reason: "SMTP email is not configured."
        };
    }

    const from = process.env.SMTP_FROM || "";
    const appName = process.env.APP_NAME || "Brew. Track. Improve.";
    const transporter = createTransport();

    await transporter.sendMail({
        from: from,
        to: toEmail,
        subject: `${appName} password reset`,
        text: [
            `We received a request to reset your ${appName} password.`,
            "",
            "Open this link to choose a new password:",
            resetUrl,
            "",
            "This link expires in 1 hour.",
            "If you did not request this reset, you can ignore this email."
        ].join("\n"),
        html: [
            `<p>We received a request to reset your <strong>${appName}</strong> password.</p>`,
            `<p><a href="${resetUrl}">Reset your password</a></p>`,
            `<p>This link expires in 1 hour.</p>`,
            `<p>If you did not request this reset, you can ignore this email.</p>`
        ].join("")
    });

    return {
        sent: true
    };
}
