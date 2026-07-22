package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.EmailDeliverySettings;
import java.util.Properties;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Component;

/** Creates a sender from the effective deployment or administrator-owned SMTP configuration. */
public interface EmailDeliverySenderFactory {
    JavaMailSender create(EmailDeliverySettings settings);

    @Component
    class Default implements EmailDeliverySenderFactory {
        private final ObjectProvider<JavaMailSender> configuredSender;

        public Default(ObjectProvider<JavaMailSender> configuredSender) {
            this.configuredSender = configuredSender;
        }

        @Override
        public JavaMailSender create(EmailDeliverySettings settings) {
            if (settings.source() == EmailDeliverySettings.Source.DEPLOYMENT) {
                JavaMailSender existing = configuredSender.getIfAvailable();
                if (existing != null) {
                    return existing;
                }
            }
            JavaMailSenderImpl sender = new JavaMailSenderImpl();
            sender.setProtocol("smtp");
            sender.setHost(settings.host());
            sender.setPort(settings.port());
            sender.setUsername(settings.username());
            sender.setPassword(settings.password());
            Properties properties = new Properties();
            properties.setProperty("mail.smtp.auth", Boolean.toString(settings.smtpAuth()));
            properties.setProperty("mail.smtp.ssl.enable", Boolean.toString(settings.sslEnabled()));
            properties.setProperty("mail.smtp.connectiontimeout", "5000");
            properties.setProperty("mail.smtp.timeout", "10000");
            properties.setProperty("mail.smtp.writetimeout", "10000");
            sender.setJavaMailProperties(properties);
            return sender;
        }
    }
}
