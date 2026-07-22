package cn.edu.training.novel.config;

import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/** Deployment-owned D-05 policy for the interval after an author application is rejected. */
@Validated
@ConfigurationProperties(prefix = "novel.author-application")
public record AuthorApplicationPolicyProperties(
        @NotNull @DefaultValue("P7D") Duration rejectionCooldown) {

    private static final Duration MAXIMUM_REJECTION_COOLDOWN = Duration.ofDays(365);

    public AuthorApplicationPolicyProperties {
        if (rejectionCooldown == null
                || rejectionCooldown.isNegative()
                || rejectionCooldown.isZero()
                || rejectionCooldown.compareTo(MAXIMUM_REJECTION_COOLDOWN) > 0) {
            throw new IllegalArgumentException(
                    "novel.author-application.rejection-cooldown must be greater than zero and no more than P365D");
        }
    }
}
