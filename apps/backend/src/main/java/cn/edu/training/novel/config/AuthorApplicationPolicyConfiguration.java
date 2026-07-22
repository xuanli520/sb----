package cn.edu.training.novel.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(AuthorApplicationPolicyProperties.class)
public class AuthorApplicationPolicyConfiguration {}
