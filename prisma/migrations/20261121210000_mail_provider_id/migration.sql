-- SES MessageId může být delší než 64 znaků (Resend UUID se vešlo).
ALTER TABLE `mcvv_mail_queue` MODIFY `provider_id` VARCHAR(255) NULL;
ALTER TABLE `mcvv_newsletter_recipient` MODIFY `provider_id` VARCHAR(255) NULL;
