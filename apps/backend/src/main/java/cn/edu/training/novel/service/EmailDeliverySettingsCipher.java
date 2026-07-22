package cn.edu.training.novel.service;

import cn.edu.training.novel.config.EmailDeliverySettingsProperties;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** AES-GCM envelope for settings secrets persisted by the station administrator. */
@Component
public class EmailDeliverySettingsCipher {
    private static final int KEY_BYTES = 32;
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final EmailDeliverySettingsProperties properties;

    public EmailDeliverySettingsCipher(EmailDeliverySettingsProperties properties) {
        this.properties = properties;
    }

    public String encrypt(String plaintext) {
        try {
            byte[] iv = new byte[IV_BYTES];
            RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key(), new GCMParameterSpec(TAG_BITS, iv));
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            byte[] envelope = Arrays.copyOf(iv, iv.length + ciphertext.length);
            System.arraycopy(ciphertext, 0, envelope, iv.length, ciphertext.length);
            return Base64.getUrlEncoder().withoutPadding().encodeToString(envelope);
        } catch (GeneralSecurityException exception) {
            throw unavailable();
        }
    }

    public String decrypt(String envelope) {
        try {
            byte[] value = Base64.getUrlDecoder().decode(envelope);
            if (value.length <= IV_BYTES) {
                throw unavailable();
            }
            byte[] iv = Arrays.copyOfRange(value, 0, IV_BYTES);
            byte[] ciphertext = Arrays.copyOfRange(value, IV_BYTES, value.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException | GeneralSecurityException exception) {
            throw unavailable();
        }
    }

    public boolean isConfigured() {
        try {
            key();
            return true;
        } catch (ResponseStatusException exception) {
            return false;
        }
    }

    private SecretKeySpec key() {
        String raw = properties.getEncryptionKey();
        if (raw == null || raw.isBlank()) {
            throw unavailable();
        }
        try {
            byte[] decoded = Base64.getUrlDecoder().decode(raw.trim());
            if (decoded.length != KEY_BYTES) {
                throw unavailable();
            }
            return new SecretKeySpec(decoded, "AES");
        } catch (IllegalArgumentException exception) {
            throw unavailable();
        }
    }

    private static ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "administrator SMTP settings encryption is unavailable");
    }
}
