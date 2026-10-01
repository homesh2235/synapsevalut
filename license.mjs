// license.mjs (Gumroad Integration)

/**
 * Verifies customer license key via Gumroad API.
 * @param {string} licenseKey - The key entered by the user in Obsidian settings.
 * @param {string} productPermalink - The slug from your Gumroad product URL (e.g. "synapse-vault").
 */
export async function activateLicense(licenseKey, productPermalink = 'synapse-vault') {
    if (!licenseKey || !licenseKey.trim()) {
        return { valid: false, message: 'Please enter a valid license key.' };
    }

    const cleanKey = licenseKey.trim();

    try {
        const res = await fetch('https://api.gumroad.com/v2/licenses/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                product_permalink: productPermalink,
                license_key: cleanKey,
                increment_uses_count: 'true'
            })
        });

        const data = await res.json();

        if (data.success && !data.purchase?.refunded && !data.purchase?.chargebacked) {
            return {
                valid: true,
                customerEmail: data.purchase?.email,
                uses: data.uses,
                message: 'License verified successfully!'
            };
        } else {
            return {
                valid: false,
                message: data.message || 'Invalid, expired, or refunded license key.'
            };
        }
    } catch (err) {
        return {
            valid: false,
            message: `Network error verifying license: ${err.message}`
        };
    }
}

/**
 * Quick local check for cached license state on startup.
 */
export function isLicenseCached(settings) {
    return Boolean(settings?.isPro && settings?.licenseKey);
}