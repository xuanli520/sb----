package cn.edu.training.novel.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Deployment-owned key used only to encrypt administrator-entered SMTP secrets at rest. */
@ConfigurationProperties(prefix = "novel.email-delivery-settings")
public final class EmailDeliverySettingsProperties {
    private String encryptionKey = "";

    public String getEncryptionKey() {
        return encryptionKey;
    }

    public void setEncryptionKey(String encryptionKey) {
        this.encryptionKey = encryptionKey;
    }

    @Override
    public String toString() {
        return "EmailDeliverySettingsProperties[encryptionKey="
                + (encryptionKey == null || encryptionKey.isBlank() ? "<empty>" : "<configured>") + "]";
    }
}
