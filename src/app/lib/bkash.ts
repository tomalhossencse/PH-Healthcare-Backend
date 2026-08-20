import config from "../config";
import { radisClient } from "./radis";

export const getBkashIdToken = async () => {
	try {
		const idTokenKey = "bkash:IdToken";
		const refreshTokenKey = "bkash:refreshToken";

		let bkashIdToken = await radisClient.get(idTokenKey);
		const bkashIdTokenTtl = await radisClient.ttl(idTokenKey);

		const bkashRefreshToken = await radisClient.get(refreshTokenKey);
		const bkashRefreshTokenTtl = await radisClient.ttl(refreshTokenKey);

		// console.log({
		// 	bkashIdToken,
		// 	bkashIdTokenTtl,
		// 	bkashRefreshToken,
		// 	bkashRefreshTokenTtl,
		// });

		if (
			(bkashIdTokenTtl <= 600 || !bkashIdToken) &&
			bkashRefreshToken &&
			bkashRefreshTokenTtl >= 600
		) {
			const refreshTokenRes = await fetch(
				`${config.bkash_base_url}/tokenized/checkout/token/refresh`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
						username: config.bkash_username,
						password: config.bkash_password,
					},
					body: JSON.stringify({
						app_key: config.bkash_app_key,
						app_secret: config.bkash_app_secret,
						refresh_token: bkashRefreshToken,
					}),
				},
			);

			if (!refreshTokenRes.ok) {
				throw new Error("Bkash Refresh Token failed");
			}

			const refreshTokenResult = await refreshTokenRes.json();

			bkashIdToken = refreshTokenResult.id_token as string;

			await radisClient.set(idTokenKey, bkashIdToken, {
				expiration: {
					type: "EX",
					value: 60 * 60,
				},
			});

			return bkashIdToken;
		}

		if (bkashIdToken && bkashIdTokenTtl > 600) {
			return bkashIdToken;
		}

		const res = await fetch(
			`${config.bkash_base_url}/tokenized/checkout/token/grant`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
					username: config.bkash_username,
					password: config.bkash_password,
				},
				body: JSON.stringify({
					app_key: config.bkash_app_key,
					app_secret: config.bkash_app_secret,
				}),
			},
		);

		if (!res.ok) {
			throw new Error("Bkash access Token grant failed");
		}

		const result = await res.json();
		await radisClient.set(idTokenKey, result.id_token, {
			expiration: {
				type: "EX",
				value: 60 * 60,
			},
		});

		await radisClient.set(refreshTokenKey, result.refresh_token, {
			expiration: {
				type: "EX",
				value: 60 * 60 * 24 * 28,
			},
		});

		bkashIdToken = result.id_token;

		return bkashIdToken;
	} catch (error: any) {
		throw new Error(error.message);
	}
};
