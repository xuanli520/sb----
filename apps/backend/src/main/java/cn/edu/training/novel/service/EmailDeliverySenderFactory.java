package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.EmailDeliverySettings;
import java.util.Properties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Component;

/** Creates a sender from the effective deployment or administrator-owned SMTP configuration. */
public interface EmailDeliverySenderFactory {
    JavaMailSender create(EmailDeliverySettings settings);

    @Component
    class Default implements EmailDeliverySenderFactory {
        private final String smtpAuthMechanisms;

        public Default(@Value("${NOVEL_SMTP_AUTH_MECHANISMS:LOGIN}") String smtpAuthMechanisms) {
            this.smtpAuthMechanisms = smtpAuthMechanisms;
        }

        @Override
        public JavaMailSender create(EmailDeliverySettings settings) {
            // Always apply the effective settings so QQ Mail does not fall back to its rejected PLAIN mechanism.
            JavaMailSenderImpl sender = new JavaMailSenderImpl();
            sender.setProtocol("smtp");
            sender.setHost(settings.host());
            sender.setPort(settings.port());
            sender.setUsername(settings.username());
            sender.setPassword(settings.password());
            Properties properties = new Properties();
            properties.setProperty("mail.smtp.auth", Boolean.toString(settings.smtpAuth()));
            properties.setProperty("mail.smtp.auth.mechanisms", smtpAuthMechanisms);
            properties.setProperty("mail.smtp.ssl.enable", Boolean.toString(settings.sslEnabled()));
            properties.setProperty("mail.smtp.connectiontimeout", "5000");
            properties.setProperty("mail.smtp.timeout", "10000");
            properties.setProperty("mail.smtp.writetimeout", "10000");
            sender.setJavaMailProperties(properties);
            return sender;
        }
    }
}
