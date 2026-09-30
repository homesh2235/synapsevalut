import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const USAGE_FILE = path.join(__dirname, '.usage.json');

function getMachineFingerprint() {
    const rawId = `${os.hostname()}-${os.platform()}-${os.arch()}-${os.cpus()[0]?.model || ''}`;
    return crypto.createHash('sha256').update(rawId).digest('hex').slice(0, 16);
}

export async function activateLicense(licenseKey) {
    const cleanKey = licenseKey.trim();
    const instanceName = `Synapse-${getMachineFingerprint()}`;

    try {
        const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/activate', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                license_key: cleanKey,
                instance_name: instanceName
            })
        });

        const data = await response.json();

        if (data.activated && data.license_key?.status === 'active') {
            const proRecord = {
                isPro: true,
                licenseKey: cleanKey,
                instanceId: data.instance?.id,
                activatedAt: Date.now(),
                signature: crypto
                    .createHash('sha256')
                    .update(`${cleanKey}-${data.instance?.id}-${instanceName}`)
                    .digest('hex')
            };

            fs.writeFileSync(USAGE_FILE, JSON.stringify(proRecord, null, 2));
            return { success: true, message: 'Synapse Pro Activated!' };
        } else {
            return {
                success: false,
                message: data.error || 'Invalid or expired license key.'
            };
        }
    } catch (error) {
        return {
            success: false,
            message: 'Network error connecting to license server.'
        };
    }
}

export function verifyProStatusLocally() {
    if (process.env.SYNAPSE_DEV_MODE === 'true') return true;

    try {
        if (!fs.existsSync(USAGE_FILE)) return false;
        const usage = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));

        if (!usage.isPro || !usage.signature) return false;

        const instanceName = `Synapse-${getMachineFingerprint()}`;
        const expectedSig = crypto
            .createHash('sha256')
            .update(`${usage.licenseKey}-${usage.instanceId}-${instanceName}`)
            .digest('hex');

        return usage.signature === expectedSig;
    } catch {
        return false;
    }
}